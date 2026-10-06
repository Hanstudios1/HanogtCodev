/**
 * Names known to the analyser. They must stay in sync with stdlib.ts (a unit
 * test checks that every global listed here is implemented).
 */

/** Members every Behaviour (MonoBehaviour) inherits. */
export const BEHAVIOUR_MEMBERS = new Set([
    "transform", "gameObject", "name", "tag", "enabled", "isActiveAndEnabled",
    "GetComponent", "GetComponents", "GetComponentInChildren", "GetComponentInParent", "GetComponentsInChildren", "AddComponent", "TryGetComponent",
    "CompareTag", "Destroy", "DestroyImmediate", "Instantiate", "Invoke", "InvokeRepeating", "CancelInvoke", "IsInvoking",
    "StartCoroutine", "StopCoroutine", "StopAllCoroutines", "print", "SendMessage", "FindObjectOfType", "FindObjectsOfType",
    "FindFirstObjectByType", "FindAnyObjectByType", "DontDestroyOnLoad", "GetInstanceID", "BroadcastMessage", "SendMessageUpwards",
    "GetComponentsInParent", "useGUILayout", "FindObjectsByType",
]);

/** Global static namespaces and functions (bare identifiers). */
export const GLOBAL_NAMES = new Set([
    // Engine API
    "Debug", "Time", "Input", "Mathf", "Math", "MathF", "Random", "Vector2", "Vector3", "Vector2Int", "Vector3Int", "Vector4",
    "Color", "Color32", "Quaternion", "KeyCode", "GameObject", "Object", "Transform", "Physics", "Physics2D", "SceneManager",
    "Application", "Screen", "Camera", "Audio", "PlayerPrefs", "WaitForSeconds", "WaitForSecondsRealtime", "WaitForEndOfFrame",
    "WaitForFixedUpdate", "WaitUntil", "WaitWhile", "ForceMode", "ForceMode2D", "Space", "Rigidbody", "Rigidbody2D", "Collider",
    "Collider2D", "HUD", "PrimitiveType", "TouchPhase", "Resources", "Gizmos", "Cursor", "CursorLockMode", "LayerMask",
    "RigidbodyType2D", "Ray", "AudioListener", "SendMessageOptions", "RuntimePlatform", "DestroyImmediate",
    // V3: tweens, timers, UI events
    "Tween", "Timer", "Ease", "LoopType", "UI", "EventSystem",
    // V4: path finding, one-shot sounds
    "Pathfinding", "AudioSource",
    // V5: Animator.StringToHash, screen effects, localization
    "Animator", "ScreenEffects", "Localization", "SystemLanguage", "PlayerInput", "SaveSystem", "JsonUtility",
    // .NET / std
    "List", "Dictionary", "HashSet", "Queue", "Stack", "string", "String", "int", "float", "double", "bool", "long", "short", "byte",
    "Int32", "Single", "Double", "Convert", "Console", "Exception", "ArgumentException", "InvalidOperationException",
    "NullReferenceException", "IndexOutOfRangeException", "KeyNotFoundException", "Array", "Enumerable", "System", "UnityEngine",
    "Hanogt", "hanogt", "std", "Action", "Func",
    // C / C++ globals
    "printf", "puts", "rand", "srand", "RAND_MAX", "M_PI", "M_PI_2", "M_PI_4", "M_E", "INFINITY", "NAN", "sin", "cos", "tan", "asin",
    "acos", "atan", "atan2", "sqrt", "pow", "abs", "fabs", "floor", "ceil", "round", "fmod", "exp", "log", "log10", "log2", "sinf",
    "cosf", "tanf", "sqrtf", "powf", "fabsf", "floorf", "ceilf", "roundf", "atan2f", "fmodf", "fminf", "fmaxf", "fmin", "fmax",
    "trunc", "truncf", "hypot", "cbrt", "time", "cout", "cerr", "endl",
    // Free functions (Unity-style)
    "print", "Destroy", "Instantiate", "DontDestroyOnLoad", "FindObjectOfType",
]);

/** Member names whose result is always an integer. */
export const INT_RESULT_MEMBERS = new Set([
    "Count", "Length", "childCount", "frameCount", "size", "length", "IndexOf", "LastIndexOf", "FindIndex", "FloorToInt",
    "RoundToInt", "CeilToInt", "Parse", "ToInt32", "Next", "GetInt", "touchCount", "count", "find", "stoi", "stol", "Sign_int",
    "GetSiblingIndex", "CompareTo", "layer", "sceneCount", "buildIndex", "width", "height", "RandomRangeInt",
    "tileCount", "CountTiles", "clipCount",
    "GetInteger", "StringToHash", "shortNameHash", "fullPathHash", "nameHash", "tagHash", "parameterCount", "layerCount", "pixelate",
    "playerIndex", "playerNumber", "gamepadCount", "maxPlayers", "slotCount",
]);

/** API members returning float. */
export const FLOAT_RESULT_MEMBERS = new Set([
    "deltaTime", "time", "fixedDeltaTime", "timeScale", "unscaledDeltaTime", "realtimeSinceStartup", "unscaledTime",
    "GetAxis", "GetAxisRaw", "value", "x", "y", "z", "w", "r", "g", "b", "a", "magnitude", "sqrMagnitude", "Sqrt", "Sin", "Cos",
    "Tan", "Atan2", "Pow", "Lerp", "LerpUnclamped", "InverseLerp", "SmoothStep", "MoveTowards", "Distance", "Dot", "Angle", "Floor",
    "Ceil", "Round", "PI", "Deg2Rad", "Rad2Deg", "Epsilon", "Infinity", "NegativeInfinity", "PingPong", "Repeat", "DeltaAngle",
    "Exp", "Log", "Log10", "Asin", "Acos", "Atan", "mass", "drag", "angularDrag", "gravityScale", "intensity", "range",
    "fieldOfView", "orthographicSize", "volume", "pitch", "GetFloat", "NextDouble", "stof", "stod", "SignedAngle", "distance",
    "SmoothDamp", "PerlinNoise", "Sign", "fillAmount", "normalizedValue", "normalizedTime", "cellSize", "minValue", "maxValue",
    "saturation", "contrast", "brightness", "hue", "chromaticAberration", "scanlines", "curvature", "exposure", "bloom", "vignette",
]);

/** Functions whose numeric result follows their arguments (int if all args are int). */
export const ARG_TYPED_MEMBERS = new Set(["Abs", "Max", "Min", "Clamp", "Range", "abs", "min", "max", "clamp"]);

export const INTEGER_TYPES = new Set(["int"]);
export const NUMERIC_TYPES = new Set(["int", "float"]);
