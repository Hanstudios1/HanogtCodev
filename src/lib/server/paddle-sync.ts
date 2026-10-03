import "server-only";

import { ENTITLED_STATUSES, isPaddleId, paddleEntitles, paddleNeedsResync, type PaddleStatus } from "@/lib/paddle";
import { isRecentCheckout, type PaddleSyncState, type UserSubscription } from "@/lib/plans";
import { commitServerMutations, getServerDocument } from "./firebase-rest";
import { PaddleApiError, customerPath, customerSubscriptions, getPaddleConfig, paddleRequest, rememberCustomer, syncSubscription, type PaddleSubscriptionEntity } from "./paddle";
import { getSubscription, subscriptionPath } from "./plans";
import { normalizeEmail } from "./validate";

/*
 * A paid plan without waiting for Paddle's notification. The webhook stays
 * the normal path (renewals, cancellations, failed payments), but a checkout
 * that completed must unlock its plan even when the notification is late,
 * refused or never sent. So the Plans page (POST /api/paddle/sync), GET
 * /api/plans and a second checkout ask Paddle directly — about the account's
 * own Paddle customer and the checkout the server opened for it. Nothing comes
 * from the browser, and a subscription is only stored for the account its
 * customer is linked to (or would be linked to by the webhook anyway).
 * Kept free of next/server so the plain-Node tests can load it.
 */

/** How long a paid transaction may wait for its subscription before a new checkout is allowed again. */
const PENDING_MAX_MS = 60 * 60_000;

/**
 * `promise`, or `fallback` once `ms` have passed: a page load or a checkout
 * shouldn't wait on a slow Paddle for the extra check (it goes on in the
 * background; what it stores counts next time).
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Remembers the checkout the Plans page opened (subscriptions/{email}.paddleCheckout); only that field changes. */
export async function rememberCheckout(email: string, transactionId: string, now = new Date()) {
    if (!isPaddleId("transaction", transactionId)) return;
    await commitServerMutations([{
        type: "update",
        path: subscriptionPath(email),
        data: { paddleCheckout: { transactionId, environment: getPaddleConfig().environment, at: now } },
        updateFields: ["paddleCheckout"],
    }]);
}

type TransactionEntity = {
    id: string;
    status?: string;
    customer_id?: string | null;
    subscription_id?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
};

/** One transaction; null when Paddle doesn't know it (or the key may not read transactions). */
async function transactionOf(transactionId: string): Promise<TransactionEntity | null> {
    try {
        const { data } = await paddleRequest<{ data?: TransactionEntity }>("GET", `/transactions/${transactionId}`);
        return data && data.id === transactionId ? data : null;
    } catch (error) {
        if (error instanceof PaddleApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
    }
}

function isEntitledStatus(status: unknown) {
    return ENTITLED_STATUSES.includes(status as PaddleStatus);
}

/** Paid, with its subscription still on the way (Paddle adds subscription_id when the transaction completes). */
function isPendingPayment(transaction: TransactionEntity, now: number) {
    if (transaction.status !== "paid" && transaction.status !== "billed") return false;
    const at = Date.parse(transaction.updated_at ?? transaction.created_at ?? "");
    return !Number.isFinite(at) || now - at <= PENDING_MAX_MS;
}

/** Stores the subscription if it belongs to the customer; true when the account's plan is unlocked afterwards. */
async function storeOwnSubscription(email: string, customerId: string, entity: PaddleSubscriptionEntity | null | undefined, subscriptionId: string) {
    if (!entity || entity.id !== subscriptionId || entity.customer_id !== customerId) return false;
    // Only a copy Paddle's API just returned: never a payload that could be stale.
    await syncSubscription(subscriptionId, { entity });
    return paddleEntitles((await getSubscription(email)).paddle);
}

/**
 * Asks Paddle about the account's purchase and stores what it finds, as the
 * webhook would. At most a few GET requests; nothing in Paddle changes.
 * - "active": a subscription unlocks a plan (also when one was stored already);
 * - "pending": the checkout's payment went through within the last hour and
 *   Paddle is still creating the subscription;
 * - "none": no customer, a customer linked to another account, or nothing paid.
 */
export async function syncAccountFromPaddle(email: string, now = Date.now()): Promise<PaddleSyncState> {
    const account = normalizeEmail(email);
    if (!account) return "none";
    const subscription = await getSubscription(account);
    if (paddleEntitles(subscription.paddle, now)) return "active";
    const customerId = subscription.paddleCustomerId;
    if (!customerId) return "none";
    // Never for an account that doesn't exist: the shared sync cancels subscriptions of deleted accounts.
    if (!(await getServerDocument(`users/${account}`))) return "none";
    // The customer must be this account's; one linked to someone else (or left by a deleted account) is never touched.
    const mapping = await getServerDocument<Record<string, unknown>>(customerPath(customerId));
    if (mapping && (mapping.deleted === true || normalizeEmail(mapping.email) !== account)) return "none";
    if (!mapping) await rememberCustomer(customerId, account, "checkout");

    let synced: string | null = null;
    const checkout = subscription.paddleCheckout;
    if (checkout && isRecentCheckout(checkout, now)) {
        const transaction = await transactionOf(checkout.transactionId);
        if (transaction && transaction.customer_id === customerId) {
            const subscriptionId = transaction.subscription_id;
            if (isPaddleId("subscription", subscriptionId)) {
                const { data } = await paddleRequest<{ data?: PaddleSubscriptionEntity }>("GET", `/subscriptions/${subscriptionId}`);
                if (await storeOwnSubscription(account, customerId, data, subscriptionId)) return "active";
                synced = subscriptionId;
            } else if (isPendingPayment(transaction, now)) {
                return "pending";
            }
        }
    }

    // Any subscription of the customer: purchases from before checkouts were remembered, or paid elsewhere (a payment link).
    const [first] = await customerSubscriptions(customerId);
    if (first && first.id !== synced && isEntitledStatus(first.status) && (await storeOwnSubscription(account, customerId, first, first.id))) return "active";
    return "none";
}

/**
 * Whether GET /api/plans should ask Paddle about the account now:
 * - "lapsed": the paid period ended but no renewal was reported (a lost webhook);
 * - "unrecorded": the account has a Paddle customer but no subscription that
 *   unlocks a plan, and either none was ever stored (a purchase whose
 *   notification never arrived, also from before this check existed) or a
 *   checkout was opened recently.
 */
export function selfHealReason(subscription: UserSubscription, now = Date.now()): "lapsed" | "unrecorded" | null {
    if (subscription.paddle && paddleNeedsResync(subscription.paddle, now)) return "lapsed";
    if (!subscription.paddleCustomerId || paddleEntitles(subscription.paddle, now)) return null;
    if (!subscription.paddle) return "unrecorded";
    return isRecentCheckout(subscription.paddleCheckout, now) ? "unrecorded" : null;
}
