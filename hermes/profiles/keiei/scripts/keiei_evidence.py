#!/usr/bin/env python3
"""keiei repo evidence. read-only. MEASURE<TAB>key<TAB>value lines + ledger append.
REFUSED + exit 2 if the repo checkout is unreadable (never a silent green)."""
import json, os, subprocess, sys, datetime

ROOT = os.path.expanduser("~/github/com-junkawasaki")
REPO = os.path.join(ROOT, "orgs/cloud-itonami/keiei")
HOME = os.path.expanduser("~/.hermes/profiles/keiei")
LEDGER = os.path.join(HOME, "workspace", "keiei-ledger.jsonl")

def refuse(reason):
    print("REFUSED\t%s" % reason)
    sys.exit(2)

if not os.path.isdir(os.path.join(REPO, ".git")):
    refuse("repo checkout missing or not a git dir: %s" % REPO)

def git(*args):
    p = subprocess.run(["git", "-C", REPO] + list(args),
                       capture_output=True, text=True)
    if p.returncode != 0:
        refuse("git %s failed: %s" % (" ".join(args), p.stderr.strip()[:200]))
    return p.stdout.strip()

rows = {}
rows["as_of"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
rows["head"] = git("rev-parse", "--short", "HEAD")
rows["last_commit_date"] = git("log", "-1", "--format=%ad", "--date=short")
rows["dirty_files"] = len([l for l in git("status", "--porcelain").splitlines() if l.strip()])

def count_ext(base, exts):
    n = 0
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in ("node_modules", ".git", "public", ".shadow-cljs", ".nbb", ".cpcr")]
        n += sum(1 for f in fns if f.endswith(exts))
    return n

rows["source_files"] = count_ext(REPO, (".cljc", ".cljs", ".cljk", ".clj", ".kotoba"))
rows["kotoba_dir_files"] = count_ext(os.path.join(REPO, "kotoba"), ("",)) if os.path.isdir(os.path.join(REPO, "kotoba")) else "absent"
rows["docs_files"] = count_ext(os.path.join(REPO, "docs"), ("",)) if os.path.isdir(os.path.join(REPO, "docs")) else "absent"

# the repo's core claim: cxoRole plaintext plane + cxoDecision encrypted plane.
# probe: are the two lexicon types referenced in source (not just README)?
for probe, key in (("cxoRole", "cxorole_refs"), ("cxoDecision", "cxodecision_refs")):
    p = subprocess.run(["grep", "-rl", probe, REPO], capture_output=True, text=True)
    files = [f for f in p.stdout.splitlines() if "/.git/" not in f and not f.endswith(".md")]
    rows[key] = len(files)

mig = os.path.join(REPO, "migration.edn")
rows["migration_edn"] = "present" if os.path.isfile(mig) else "absent"
migtodo = os.path.join(REPO, "MIGRATION-TODO.md")
rows["migration_todo_present"] = "present" if os.path.isfile(migtodo) else "absent"

for k, v in rows.items():
    print("MEASURE\t%s\t%s" % (k, v))

os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
with open(LEDGER, "a") as f:
    f.write(json.dumps(rows, ensure_ascii=False) + "\n")
print("LEDGER\tappended\t%s" % LEDGER)
