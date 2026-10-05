"""Lists the files of TheAlgorithms/Python worth learning from, as JSON lines.

A file qualifies when it is a module (not a test or package file) of at most
8,000 characters, imports only the standard library, has a docstring and at
least one doctest, and its doctests pass here. Used by
training/import-github.mjs:  python3 training/lib/thealgorithms.py <repo dir>
"""
import ast
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

SKIP_DIRS = {".git", ".github", "scripts", "web_programming", "quantum", "machine_learning", "neural_network", "computer_vision", "fuzzy_logic", "project_euler", "audio_filters", "digital_image_processing"}
STDLIB = set(sys.stdlib_module_names)


def imports_only_stdlib(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in STDLIB:
                    return False
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                return False
            if (node.module or "").split(".")[0] not in STDLIB:
                return False
    return True


def first_docstring(tree):
    doc = ast.get_docstring(tree)
    if doc:
        return doc
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
            doc = ast.get_docstring(node)
            if doc:
                return doc
    return None


def candidate(path, root):
    try:
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
    except (OSError, UnicodeDecodeError):
        return None
    if len(source) > 8000 or ">>>" not in source:
        return None
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    if not imports_only_stdlib(tree):
        return None
    doc = first_docstring(tree)
    if not doc or len(doc) < 20:
        return None
    rel = os.path.relpath(path, root)
    return {"path": rel, "source": source, "doc": doc}


def verify(item, root):
    path = os.path.join(root, item["path"])
    try:
        result = subprocess.run([sys.executable, "-m", "doctest", path], cwd=os.path.dirname(path), capture_output=True, timeout=10, text=True)
        ok = result.returncode == 0
    except subprocess.TimeoutExpired:
        ok = False
    return {**item, "ok": ok}


def main():
    root = os.path.abspath(sys.argv[1])
    items = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(name for name in dirnames if name not in SKIP_DIRS and not name.startswith("."))
        if os.path.relpath(dirpath, root) == ".":
            continue
        for name in sorted(filenames):
            if not name.endswith(".py") or name.startswith("__") or name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py":
                continue
            item = candidate(os.path.join(dirpath, name), root)
            if item:
                items.append(item)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(lambda item: verify(item, root), items):
            parts = result["path"].split(os.sep)
            title = os.path.splitext(parts[-1])[0].replace("_", " ").strip()
            first = result["doc"].strip().split("\n\n")[0].strip()
            print(json.dumps({"path": result["path"], "category": parts[0].replace("_", " "), "title": title, "description": first[:700], "code": result["source"], "ok": result["ok"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
