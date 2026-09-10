import io
import struct
import unittest
from desktop.host import read_message
from desktop.translation_support import TranslationCache, glossary_prompt


class SupportTests(unittest.TestCase):
    def test_cache_terms_and_lru(self):
        cache = TranslationCache(2)
        a = cache.key("test", [])
        b = cache.key("test", [{"source": "test", "target": "測試"}])
        self.assertNotEqual(a, b)
        self.assertNotEqual(a, cache.key("test", [], "zh-ja"))
        cache.put(a, "a")
        cache.put(b, "b")
        cache.get(a)
        cache.put("c", "c")
        self.assertIsNone(cache.get(b))
        self.assertEqual(cache.get(a), "a")

    def test_glossary_empty_entries(self):
        self.assertEqual(glossary_prompt([{"source": "", "target": "a"}]), "")
        self.assertIn('"魚" → "魚"', glossary_prompt([{"source": "魚", "target": "魚"}]))

    def test_framing_limits(self):
        self.assertIsNone(read_message(io.BytesIO()))
        with self.assertRaises(ValueError):
            read_message(io.BytesIO(struct.pack("<I", 3) + b"{}"))
        with self.assertRaises(ValueError):
            read_message(io.BytesIO(struct.pack("<I", 2_000_001)))


if __name__ == "__main__":
    unittest.main()
