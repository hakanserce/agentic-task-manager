"""Build plugin/scripts/atm.py from the modules in atm-cli/atm/.

The plugin ships one readable file (users install by cloning; nothing is built on their side), while development
happens in modules. The build concatenates the modules in dependency order under a banner each, hoists and
deduplicates their standard-library imports, and drops their imports of each other, since everything ends up in one
namespace. It refuses to build when two modules define the same top-level name (concatenation would silently shadow
one), or when a module imports from a later module or a name another module doesn't define.

Usage: python3 atm-cli/build.py           write plugin/scripts/atm.py (only if it changed)
       python3 atm-cli/build.py --check   exit 1 if plugin/scripts/atm.py is not what the modules build
       python3 atm-cli/build.py --output F   write the build to F instead
Design: docs/v4/atm-cli.md, section 2.
"""

import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACKAGE = os.path.join(HERE, "atm")
TARGET = os.path.join(os.path.dirname(HERE), "plugin", "scripts", "atm.py")
# Dependency order: a module may only import from modules before it
MODULES = [
    "core",
    "paths",
    "lock",
    "model",
    "claims",
    "query",
    "tasks",
    "edit",
    "merge",
    "archive",
    "migrate",
    "server",
    "cli",
]
HEADER = (
    "# Generated from atm-cli/atm/ by atm-cli/build.py. Don't edit this file: edit the modules and run\n"
    "# `npm run build:cli` in dashboard/ (the pre-commit hook does it too).\n"
)


class BuildError(Exception):
    pass


def docstring_node(tree):
    first = tree.body[0] if tree.body else None
    if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
        return first
    return None


def top_level_names(tree):
    """Names a module defines at the top level (functions, classes, assigned names)."""
    names = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                names.extend(n.id for n in ast.walk(target) if isinstance(n, ast.Name))
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.append(node.target.id)
    return names


def read_module(name):
    path = os.path.join(PACKAGE, name + ".py")
    with open(path, encoding="utf-8") as f:
        source = f.read()
    tree = ast.parse(source, path)
    return source, tree


def build():
    """Return the text of the built atm.py."""
    with open(os.path.join(PACKAGE, "__init__.py"), encoding="utf-8") as f:
        init_tree = ast.parse(f.read())
    package_doc = docstring_node(init_tree)
    if package_doc is None:
        raise BuildError("atm-cli/atm/__init__.py needs a docstring: it becomes the built file's docstring")

    defined = {}  # name -> module that defines it
    plain_imports, from_imports = set(), {}
    sections = []
    for index, name in enumerate(MODULES):
        source, tree = read_module(name)
        lines = source.splitlines()
        drop = set()  # 1-based line numbers left out of the body

        doc = docstring_node(tree)
        comment = []
        if doc:
            drop.update(range(doc.lineno, doc.end_lineno + 1))
            comment = ["# " + line if line.strip() else "#" for line in doc.value.value.strip().splitlines()]

        for node in tree.body:
            if isinstance(node, ast.Import):
                plain_imports.update(
                    alias.name + (f" as {alias.asname}" if alias.asname else "") for alias in node.names
                )
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                from_imports.setdefault(node.module, set()).update(
                    alias.name + (f" as {alias.asname}" if alias.asname else "") for alias in node.names
                )
            elif isinstance(node, ast.ImportFrom):
                source_module = node.module
                if source_module not in MODULES[:index]:
                    raise BuildError(f"{name}.py imports from {source_module}, which isn't an earlier module")
                for alias in node.names:
                    if alias.asname:
                        raise BuildError(f"{name}.py: 'import ... as' between modules doesn't survive the build")
                    if defined.get(alias.name) != source_module:
                        raise BuildError(f"{name}.py imports {alias.name} from {source_module}, which doesn't define it")
            else:
                continue
            drop.update(range(node.lineno, node.end_lineno + 1))

        for defined_name in top_level_names(tree):
            if defined_name in defined:
                raise BuildError(f"{defined_name} is defined in both {defined[defined_name]}.py and {name}.py")
            defined[defined_name] = name

        body = [line for number, line in enumerate(lines, 1) if number not in drop]
        while body and not body[0].strip():
            body.pop(0)
        while body and not body[-1].strip():
            body.pop()
        sections.append("\n".join([f"# ==== {name}.py ===="] + comment + ([""] if comment else []) + body))

    imports = [f"import {name}" for name in sorted(plain_imports)]
    imports += [f"from {module} import {', '.join(sorted(names))}" for module, names in sorted(from_imports.items())]
    docstring = '"""' + package_doc.value.value + '"""'
    return HEADER + docstring + "\n\n" + "\n".join(imports) + "\n\n\n" + "\n\n\n".join(sections) + "\n"


def main(argv):
    try:
        text = build()
    except BuildError as e:
        sys.stderr.write(f"build.py: {e}\n")
        return 1
    if "--check" in argv:
        try:
            with open(TARGET, encoding="utf-8") as f:
                current = f.read()
        except OSError:
            current = None
        if current != text:
            sys.stderr.write(
                "build.py: plugin/scripts/atm.py is stale. Run `npm run build:cli` in dashboard/ and commit it.\n"
            )
            return 1
        return 0
    target = argv[argv.index("--output") + 1] if "--output" in argv else TARGET
    try:
        with open(target, encoding="utf-8") as f:
            if f.read() == text:
                return 0
    except OSError:
        pass
    with open(target, "w", encoding="utf-8") as f:
        f.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
