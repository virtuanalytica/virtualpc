#!/usr/bin/env python3
"""Small JSON stdin/stdout bridge to fzliu/radient's local text vectorizer."""
import json
import sys


def main() -> int:
    try:
        from radient import text_vectorizer
    except ImportError:
        print("Install the optional local dependency with: pip install radient sentence-transformers", file=sys.stderr)
        return 2

    request = json.load(sys.stdin)
    texts = request.get("texts")
    if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
        print("texts must be a list of strings", file=sys.stderr)
        return 3

    vectorizer = text_vectorizer()
    vectors = [[float(value) for value in vectorizer.vectorize(text)] for text in texts]
    json.dump({"vectors": vectors}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
