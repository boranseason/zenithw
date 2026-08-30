import unittest
from pathlib import Path


FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


class StandaloneToolPageTests(unittest.TestCase):
    def test_navigation_tools_are_no_longer_embedded_in_index(self):
        source = (FRONTEND / "index.html").read_text(encoding="utf-8")
        for overlay_id in (
            "historyOverlay", "remuxOverlay", "convOverlay",
            "stOverlay", "donOverlay", "servicesOverlay",
        ):
            self.assertNotIn(f'id="{overlay_id}"', source)
        for workflow_overlay in ("dlOverlay", "plQueueOverlay", "saveOverlay"):
            self.assertIn(f'id="{workflow_overlay}"', source)

    def test_every_tool_destination_keeps_shared_navigation(self):
        for filename in (
            "history.html", "convert.html", "remux.html",
            "settings.html", "support.html", "services.html",
        ):
            with self.subTest(filename=filename):
                source = (FRONTEND / filename).read_text(encoding="utf-8")
                self.assertIn('id="siteBottomNav"', source)
                self.assertIn('src="site-shell.js"', source)

    def test_support_page_has_no_papara_details(self):
        source = (FRONTEND / "support.html").read_text(encoding="utf-8").lower()
        self.assertNotIn("papara", source)
        self.assertIn("instagram", source)
        self.assertIn("info@zenithw.space", source)

    def test_greeting_is_time_and_language_aware(self):
        index = (FRONTEND / "index.html").read_text(encoding="utf-8")
        shell = (FRONTEND / "site-shell.js").read_text(encoding="utf-8")
        self.assertIn('id="timeGreeting"', index)
        for language in ("tr", "en", "fr", "de"):
            self.assertIn(f"{language}:{{morning:", shell)
        for period in ("morning", "noon", "evening", "night"):
            self.assertIn(f"'{period}'", shell)


if __name__ == "__main__":
    unittest.main()
