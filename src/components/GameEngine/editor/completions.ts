/**
 * Lightweight IntelliSense for engine scripts: member lists for the engine API
 * and lifecycle snippets. Used by the Monaco completion provider.
 */

export const API_MEMBERS: Record<string, string[]> = {
    Debug: ["Log(message)", "LogWarning(message)", "LogError(message)", "LogFormat(format, args)", "DrawLine(start, end, color, duration)", "DrawRay(start, dir, color, duration)", "Assert(condition, message)", "Break()"],
    Time: ["deltaTime", "fixedDeltaTime", "time", "timeScale", "unscaledDeltaTime", "unscaledTime", "realtimeSinceStartup", "frameCount", "timeSinceLevelLoad"],
    Input: ["GetKey(KeyCode.Space)", "GetKeyDown(KeyCode.Space)", "GetKeyUp(KeyCode.Space)", "GetAxis(\"Horizontal\")", "GetAxisRaw(\"Horizontal\")", "GetButton(\"Jump\")", "GetButtonDown(\"Jump\")", "GetButtonUp(\"Jump\")", "GetMouseButton(0)", "GetMouseButtonDown(0)", "GetMouseButtonUp(0)", "mousePosition", "mouseScrollDelta", "anyKey", "anyKeyDown", "touchCount", "GetTouch(0)", "inputString"],
    Physics: ["Raycast(origin, direction, out hit, maxDistance)", "RaycastAll(origin, direction, maxDistance)", "Linecast(start, end)", "SphereCast(origin, radius, direction, out hit, maxDistance)", "OverlapSphere(center, radius)", "CheckSphere(center, radius)", "OverlapBox(center, halfExtents)", "gravity"],
    Physics2D: ["Raycast(origin, direction, distance)", "Linecast(start, end)", "OverlapCircle(point, radius)", "OverlapCircleAll(point, radius)", "OverlapPoint(point)", "OverlapBox(point, size, angle)", "CircleCast(origin, radius, direction, distance)", "gravity"],
    GameObject: ["Find(\"Name\")", "FindWithTag(\"Player\")", "FindGameObjectWithTag(\"Player\")", "FindGameObjectsWithTag(\"Enemy\")", "CreatePrimitive(PrimitiveType.Cube)", "Instantiate(original, position, rotation)", "Destroy(obj, delay)"],
    SceneManager: ["LoadScene(\"SceneName\")", "LoadScene(0)", "GetActiveScene()", "sceneCountInBuildSettings"],
    Application: ["Quit()", "targetFrameRate", "isPlaying", "platform", "isMobilePlatform", "productName"],
    Screen: ["width", "height", "dpi", "fullScreen"],
    Camera: ["main"],
    Mathf: ["Abs(x)", "Clamp(value, min, max)", "Clamp01(value)", "Lerp(a, b, t)", "LerpAngle(a, b, t)", "InverseLerp(a, b, value)", "MoveTowards(current, target, maxDelta)", "SmoothDamp(current, target, ref velocity, smoothTime)", "Sin(x)", "Cos(x)", "Tan(x)", "Atan2(y, x)", "Sqrt(x)", "Pow(x, p)", "Min(a, b)", "Max(a, b)", "Floor(x)", "Ceil(x)", "Round(x)", "FloorToInt(x)", "RoundToInt(x)", "CeilToInt(x)", "Sign(x)", "PingPong(t, length)", "Repeat(t, length)", "PerlinNoise(x, y)", "Approximately(a, b)", "DeltaAngle(a, b)", "PI", "Deg2Rad", "Rad2Deg", "Infinity", "Epsilon"],
    Random: ["Range(min, max)", "value", "insideUnitCircle", "insideUnitSphere", "onUnitSphere", "rotation", "ColorHSV()", "InitState(seed)"],
    Vector3: ["zero", "one", "up", "down", "left", "right", "forward", "back", "Distance(a, b)", "Lerp(a, b, t)", "MoveTowards(current, target, maxDelta)", "Dot(a, b)", "Cross(a, b)", "Normalize(v)", "Angle(a, b)", "ClampMagnitude(v, max)", "Reflect(dir, normal)", "Project(v, onNormal)", "Scale(a, b)", "Slerp(a, b, t)", "SmoothDamp(current, target, ref velocity, smoothTime)"],
    Vector2: ["zero", "one", "up", "down", "left", "right", "Distance(a, b)", "Lerp(a, b, t)", "MoveTowards(current, target, maxDelta)", "Dot(a, b)", "Angle(a, b)", "SignedAngle(a, b)", "Perpendicular(v)", "Reflect(dir, normal)", "ClampMagnitude(v, max)"],
    Quaternion: ["identity", "Euler(x, y, z)", "AngleAxis(angle, axis)", "LookRotation(forward, up)", "Slerp(a, b, t)", "Lerp(a, b, t)", "RotateTowards(from, to, maxDegrees)", "Inverse(q)", "Angle(a, b)", "FromToRotation(from, to)"],
    Color: ["red", "green", "blue", "white", "black", "yellow", "cyan", "magenta", "gray", "clear", "Lerp(a, b, t)", "HSVToRGB(h, s, v)"],
    PlayerPrefs: ["GetInt(\"key\", 0)", "SetInt(\"key\", value)", "GetFloat(\"key\", 0f)", "SetFloat(\"key\", value)", "GetString(\"key\", \"\")", "SetString(\"key\", value)", "HasKey(\"key\")", "DeleteKey(\"key\")", "DeleteAll()", "Save()"],
    Audio: ["Play(\"coin\")", "Play(\"jump\", volume, pitch)", "volume", "mute"],
    HUD: ["Show(\"Mesaj\", seconds)", "Hide()"],
    Resources: ["Load(\"PrefabName\")"],
    transform: ["position", "localPosition", "rotation", "localRotation", "eulerAngles", "localEulerAngles", "localScale", "lossyScale", "forward", "right", "up", "parent", "root", "childCount", "Translate(x, y, z)", "Rotate(x, y, z)", "RotateAround(point, axis, angle)", "LookAt(target)", "SetParent(parent)", "GetChild(index)", "Find(\"Child\")", "TransformPoint(p)", "InverseTransformPoint(p)", "TransformDirection(d)", "SetPositionAndRotation(position, rotation)", "DetachChildren()"],
    gameObject: ["name", "tag", "activeSelf", "activeInHierarchy", "transform", "SetActive(false)", "GetComponent<Rigidbody>()", "AddComponent<Rigidbody>()", "CompareTag(\"Player\")", "SendMessage(\"Method\")"],
};

export const TYPE_MEMBERS: Record<string, string[]> = {
    Rigidbody: ["velocity", "angularVelocity", "mass", "drag", "angularDrag", "useGravity", "isKinematic", "freezeRotation", "position", "rotation", "AddForce(force, ForceMode.Impulse)", "AddRelativeForce(force)", "AddTorque(torque)", "AddExplosionForce(force, position, radius)", "MovePosition(position)", "MoveRotation(rotation)", "Sleep()", "WakeUp()"],
    Rigidbody2D: ["velocity", "angularVelocity", "mass", "drag", "gravityScale", "bodyType", "isKinematic", "freezeRotation", "position", "rotation", "AddForce(force, ForceMode2D.Impulse)", "AddTorque(torque)", "MovePosition(position)", "MoveRotation(angle)"],
    Collider: ["isTrigger", "enabled", "bounds", "attachedRigidbody", "gameObject", "tag", "name", "CompareTag(\"Player\")", "ClosestPoint(point)", "GetComponent<T>()"],
    SpriteRenderer: ["color", "flipX", "flipY", "sortingOrder", "enabled", "material", "shape"],
    MeshRenderer: ["material", "enabled", "shadowCastingMode", "receiveShadows"],
    Text: ["text", "color", "fontSize", "enabled"],
    AudioSource: ["Play()", "PlayOneShot(clip)", "Stop()", "volume", "pitch", "clip", "isPlaying"],
    ParticleSystem: ["Play()", "Stop()", "Pause()", "Clear()", "Emit(count)", "isPlaying", "particleCount", "main"],
    Camera: ["fieldOfView", "orthographicSize", "orthographic", "backgroundColor", "ScreenToWorldPoint(position)", "WorldToScreenPoint(position)", "ScreenPointToRay(position)", "ViewportToWorldPoint(position)"],
    Light: ["color", "intensity", "range", "spotAngle", "enabled"],
    Collision: ["gameObject", "transform", "collider", "rigidbody", "relativeVelocity", "contacts", "contactCount", "GetContact(0)"],
    RaycastHit: ["point", "normal", "distance", "collider", "transform", "rigidbody", "gameObject"],
};

export const LIFECYCLE_SNIPPETS: Array<{ label: string; detail: string; csharp: string; cpp: string }> = [
    { label: "Awake", detail: "Nesne oluşturulurken bir kez", csharp: "void Awake()\n{\n    $0\n}", cpp: "void Awake() {\n    $0\n}" },
    { label: "Start", detail: "İlk Update'ten önce bir kez", csharp: "void Start()\n{\n    $0\n}", cpp: "void Start() {\n    $0\n}" },
    { label: "Update", detail: "Her kare", csharp: "void Update()\n{\n    $0\n}", cpp: "void Update() {\n    $0\n}" },
    { label: "FixedUpdate", detail: "Sabit fizik adımında", csharp: "void FixedUpdate()\n{\n    $0\n}", cpp: "void FixedUpdate() {\n    $0\n}" },
    { label: "LateUpdate", detail: "Tüm Update'lerden sonra", csharp: "void LateUpdate()\n{\n    $0\n}", cpp: "void LateUpdate() {\n    $0\n}" },
    { label: "OnCollisionEnter", detail: "Çarpışma başladı (3D)", csharp: "void OnCollisionEnter(Collision collision)\n{\n    $0\n}", cpp: "void OnCollisionEnter(Collision* collision) {\n    $0\n}" },
    { label: "OnCollisionEnter2D", detail: "Çarpışma başladı (2D)", csharp: "void OnCollisionEnter2D(Collision2D collision)\n{\n    $0\n}", cpp: "void OnCollisionEnter2D(Collision2D* collision) {\n    $0\n}" },
    { label: "OnTriggerEnter", detail: "Tetikleyiciye girildi (3D)", csharp: "void OnTriggerEnter(Collider other)\n{\n    $0\n}", cpp: "void OnTriggerEnter(Collider* other) {\n    $0\n}" },
    { label: "OnTriggerEnter2D", detail: "Tetikleyiciye girildi (2D)", csharp: "void OnTriggerEnter2D(Collider2D other)\n{\n    $0\n}", cpp: "void OnTriggerEnter2D(Collider2D* other) {\n    $0\n}" },
    { label: "OnTriggerExit", detail: "Tetikleyiciden çıkıldı", csharp: "void OnTriggerExit(Collider other)\n{\n    $0\n}", cpp: "void OnTriggerExit(Collider* other) {\n    $0\n}" },
    { label: "OnMouseDown", detail: "Nesneye tıklandı", csharp: "void OnMouseDown()\n{\n    $0\n}", cpp: "void OnMouseDown() {\n    $0\n}" },
    { label: "OnDestroy", detail: "Nesne yok edilirken", csharp: "void OnDestroy()\n{\n    $0\n}", cpp: "void OnDestroy() {\n    $0\n}" },
    { label: "Coroutine", detail: "IEnumerator + yield", csharp: "IEnumerator ${1:Routine}()\n{\n    yield return new WaitForSeconds(${2:1f});\n    $0\n}", cpp: "IEnumerator ${1:Routine}() {\n    co_yield new WaitForSeconds(${2:1.0f});\n    $0\n}" },
];

export const GLOBAL_SUGGESTIONS = [
    "Debug", "Time", "Input", "Physics", "Physics2D", "GameObject", "SceneManager", "Application", "Screen", "Camera", "Mathf", "Random",
    "Vector2", "Vector3", "Quaternion", "Color", "PlayerPrefs", "Audio", "HUD", "Resources", "KeyCode", "ForceMode", "ForceMode2D", "Space",
    "WaitForSeconds", "WaitUntil", "Instantiate", "Destroy", "StartCoroutine", "Invoke", "InvokeRepeating", "GetComponent", "transform", "gameObject",
];
