"""Adapted from rioX432/live-translate glossary-utils and TranslationCache.

Copyright (c) 2026 RIO (Ryosuke Shimizu). MIT; see LIVE_TRANSLATE_LICENSE.
Python adaptation keys by glossary as well as language to avoid stale terms.
"""
from collections import OrderedDict
import json


def glossary_prompt(entries):
    lines = [f'  "{e["source"]}" → "{e["target"]}"'
             for e in entries if e.get("source") and e.get("target")]
    return "Use these fixed translations for specific terms:\n" + "\n".join(lines) if lines else ""


class TranslationCache:
    def __init__(self, capacity=500):
        self.capacity = max(1, capacity)
        self.entries = OrderedDict()

    def key(self, text, glossary, direction="ja-zh"):
        return json.dumps([text, direction, glossary], ensure_ascii=False, sort_keys=True)

    def get(self, key):
        if key not in self.entries:
            return None
        self.entries.move_to_end(key)
        return self.entries[key]

    def put(self, key, value):
        self.entries[key] = value
        self.entries.move_to_end(key)
        while len(self.entries) > self.capacity:
            self.entries.popitem(last=False)
