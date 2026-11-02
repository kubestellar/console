#!/usr/bin/env python3
"""Regression tests for the Auto-QA standardized-card-hook scan (no dependencies)."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/auto-qa.yml").read_text()
SCAN = WORKFLOW.split('          NON_STANDARD_CARDS=$(', 1)[1].split('done | head -10)', 1)[0] + 'done'


class CentralizationScanTest(unittest.TestCase):
    def scan(self, path):
        result = subprocess.run(['bash', '-e', '-c', SCAN], check=True,
                                env={**os.environ, 'CARD_FILES': str(path)},
                                capture_output=True, text=True)
        self.assertEqual(result.stderr, '')
        return result.stdout

    def test_hook_and_exemption_patterns(self):
        with tempfile.TemporaryDirectory() as directory:
            card = Path(directory) / 'Card.tsx'
            for marker, reported in [
                ('useCardData()', False), ('useCardDemoState()', False),
                ('useCardLoadingState()', False), ('useReportCardDataState()', False),
                ('// demoData-exempt: parent owns data state', False),
                ('', True), ('useCardHistory()', True), ('useCardDataCustom()', True),
            ]:
                with self.subTest(marker=marker):
                    card.write_text(marker + '\nuseState()\nuseState()\nuseEffect()\n')
                    expected = '  - Card.tsx (3 hooks, not using standardized card hooks)\n'
                    self.assertEqual(self.scan(card), expected if reported else '')

    def test_reported_false_positives(self):
        for name in ['KubeSnake.tsx', 'ClusterGroupsForms.tsx']:
            with self.subTest(card=name):
                self.assertEqual(self.scan(ROOT / 'web/src/components/cards' / name), '')


if __name__ == '__main__':
    unittest.main()
