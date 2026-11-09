#!/usr/bin/env python3
"""Regression tests for Auto-QA localization scanning (no dependencies)."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / '.github/workflows/auto-qa.yml').read_text()
STEP = WORKFLOW.split('        id: focus_i18n\n', 1)[1].split('\n      - name:', 1)[0]
SCAN = textwrap.dedent(STEP.split('        run: |\n', 1)[1])


class LocalizationScanTest(unittest.TestCase):
    def test_fixture_exclusion_and_production_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['Tooltip.test.tsx', 'Button.spec.tsx', 'Button.stories.tsx',
                         '__tests__/Fixture.tsx', '__mocks__/Button.tsx', 'node_modules/Button.tsx']:
                path = root / 'src' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('<button>Trigger</button>\n' + '<h1>Fixture heading</h1>\n' * 12)
            output = root / 'output'
            report = root / 'report'
            for tag in [None, 'button', 'Button', 'h1']:
                with self.subTest(tag=tag):
                    if tag:
                        (root / 'src/Live.tsx').write_text(f'<{tag}>Save</{tag}>\n' * 12)
                    output.write_text('')
                    subprocess.run(['bash', '-e', '-o', 'pipefail', '-c',
                                    SCAN.replace('/tmp/focus-i18n.txt', str(report))],
                                   cwd=root, env={**os.environ, 'GITHUB_OUTPUT': str(output)},
                                   check=True, capture_output=True, text=True)
                    self.assertEqual(output.read_text(), f'found={"true" if tag else "false"}\n')
                    if tag:
                        self.assertIn('src/Live.tsx:', report.read_text())
                        self.assertNotIn('Trigger', report.read_text())
                        self.assertNotIn('Fixture heading', report.read_text())


if __name__ == '__main__':
    unittest.main()
