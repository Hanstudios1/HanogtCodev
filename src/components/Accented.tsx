/**
 * A translated sentence with one part in the accent gradient (a name, a
 * product). The part is marked when the copy is formatted, so translations
 * can put it anywhere: tx(copy, { name: accent(firstName) }).
 */
const MARK = "⁣";

export function accent(value: string) {
    return `${MARK}${value}${MARK}`;
}

export default function Accented({ text, className = "text-gradient animate-gradient" }: { text: string; className?: string }) {
    const parts = text.split(MARK);
    if (parts.length !== 3) return <>{parts.join("")}</>;
    return (
        <>
            {parts[0]}
            <span className={className}>{parts[1]}</span>
            {parts[2]}
        </>
    );
}
