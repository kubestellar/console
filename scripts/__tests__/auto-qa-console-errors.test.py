#!/usr/bin/env python3
"""Regression tests for the actual Auto-QA shell scanners (no YAML dependency).

Run: python3 scripts/__tests__/auto-qa-console-errors.test.py
"""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = (Path(__file__).resolve().parents[2] / '.github/workflows/auto-qa.yml').read_text()


class ConsoleErrorScannerTests(unittest.TestCase):
    def scan(self, source, variable, filename='Fixture.tsx'):
        start = WORKFLOW.index(f'          {variable}=')
        end_marker = ('          CONSOLE_ERROR_ONLY=$(echo' if variable == 'HANDLER_PATTERN'
                      else '          if [ -n "$UNSAFE_ACCESS" ]')
        end = WORKFLOW.index(end_marker, start)
        script = textwrap.dedent(WORKFLOW[start:end])
        result_variable = 'CONSOLE_ERROR_ONLY' if variable == 'HANDLER_PATTERN' else variable
        with tempfile.TemporaryDirectory() as directory:
            src = Path(directory) / 'src'
            src.mkdir()
            (src / filename).write_text(source)
            result = subprocess.run(
                ['bash', '-eo', 'pipefail', '-c', script + f'\nprintf "%s" "${result_variable}"'],
                cwd=directory, env={**os.environ, 'LC_ALL': 'C'}, capture_output=True, text=True,
                check=True,
            )
        return result.stdout.strip()

    def test_visible_handlers_are_not_reported(self):
        for handler in ['setError(message)', 'setSubmitError(message)', 'showToast(message, "error")']:
            with self.subTest(handler=handler):
                self.assertEqual('', self.scan(f'console.error(err)\n{handler}\n', 'HANDLER_PATTERN'))

    def test_conditional_message_before_toast_is_not_reported(self):
        source = '''console.error('Failed to fetch access:', err)
setAccessEntries([])
const message = err instanceof Error && err.message?.includes('403')
  ? t('namespaces.adminAccessRequired')
  : t('namespaces.fetchAccessFailed')
showToast(message, 'error')
'''
        self.assertEqual('', self.scan(source, 'HANDLER_PATTERN'))

    def test_console_only_error_is_still_reported(self):
        self.assertIn('console.error(err)', self.scan('console.error(err)\n', 'HANDLER_PATTERN'))

    def test_spread_syntax_is_not_property_access(self):
        for source in ['[...prev, clusterName]', '{ ...MESSAGE_STYLE, alignItems: alignment }',
                       '[cluster.name, ...(cluster.aliases || [])]', '[...m.messages].reverse()']:
            with self.subTest(source=source):
                self.assertEqual('', self.scan(source, 'UNSAFE_ACCESS'))

    def test_deep_property_chain_is_still_reported(self):
        self.assertIn('data.status.capacity.storage', self.scan('data.status.capacity.storage', 'UNSAFE_ACCESS'))

    def test_test_files_are_excluded(self):
        for filename in ['Fixture.test.tsx', 'Fixture.spec.tsx']:
            with self.subTest(filename=filename):
                self.assertEqual('', self.scan('data.status.capacity.storage', 'UNSAFE_ACCESS', filename))


if __name__ == '__main__':
    unittest.main()
