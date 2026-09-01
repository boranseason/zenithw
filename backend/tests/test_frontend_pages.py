import unittest
from pathlib import Path


FRONTEND = Path(__file__).resolve().parents[2] / "frontend"


class StandaloneToolPageTests(unittest.TestCase):
    def test_navigation_tools_are_no_longer_embedded_in_index(self):
        source = (FRONTEND / "index.html").read_text(encoding="utf-8")
        for overlay_id in (
            "historyOverlay", "remuxOverlay", "convOverlay",
            "stOverlay", "donOverlay",
        ):
            self.assertNotIn(f'id="{overlay_id}"', source)
        self.assertIn('id="servicesOverlay"', source)
        for workflow_overlay in ("dlOverlay", "plQueueOverlay", "saveOverlay"):
            self.assertIn(f'id="{workflow_overlay}"', source)

    def test_every_tool_destination_keeps_shared_navigation(self):
        for filename in (
            "history.html", "convert.html", "remux.html",
            "settings.html", "support.html",
        ):
            with self.subTest(filename=filename):
                source = (FRONTEND / filename).read_text(encoding="utf-8")
                self.assertIn('id="siteBottomNav"', source)
                self.assertIn('src="site-shell.js?v=14.3"', source)

    def test_services_are_a_home_page_popover(self):
        source = (FRONTEND / "index.html").read_text(encoding="utf-8")
        self.assertIn('onclick="toggleServices()"', source)
        self.assertIn('class="services-popover"', source)
        self.assertFalse((FRONTEND / "services.html").exists())

    def test_support_page_has_no_papara_details(self):
        source = (FRONTEND / "support.html").read_text(encoding="utf-8").lower()
        self.assertNotIn("papara", source)
        self.assertIn("instagram", source)
        self.assertIn("info@zenithw.space", source)

    def test_greeting_is_time_and_language_aware(self):
        index = (FRONTEND / "index.html").read_text(encoding="utf-8")
        shell = (FRONTEND / "site-shell.js").read_text(encoding="utf-8")
        self.assertIn('id="timeGreeting"', index)
        self.assertNotIn('class="logo-wrap" onclick=', index)
        self.assertIn("const TR_GREETING_COUNT=110", shell)
        for period in ("deepNight", "morning", "noon", "evening", "lateNight"):
            self.assertIn(f"{period}:", shell)
        for tier in ("common", "rare", "epic", "legendary"):
            self.assertIn(f"{tier}:", shell)
        for language in ("en", "fr", "de"):
            self.assertIn(f"{language}:{{deepNight:", shell)

    def test_v14_release_is_current_and_v13_8_is_archived(self):
        version = (FRONTEND / "version.js").read_text(encoding="utf-8")
        updates = (FRONTEND / "updates-core.99daf4ea6088.js").read_text(encoding="utf-8")
        archive = (FRONTEND / "updates-archive.07c744021db2.js").read_text(encoding="utf-8")
        self.assertIn("ver: 'v14.0'", version)
        self.assertIn("Fanta molasında başlayan yeni bir ZenithW", updates)
        self.assertIn("['v14.0', 'v13.8'", updates)
        self.assertIn("{ver:'v13.8',latest:false", archive)

    def test_settings_use_the_wide_workspace_layout(self):
        settings = (FRONTEND / "settings.html").read_text(encoding="utf-8")
        shell = (FRONTEND / "site-shell.css").read_text(encoding="utf-8")
        self.assertIn('class="theme-default tool-page settings-page mobile-settings-index"', settings)
        self.assertIn('id="appVersion"', settings)
        self.assertIn('id="stPageAccessibility"', settings)
        self.assertIn('id="stPageAdvanced"', settings)
        self.assertIn('id="mobileSettingsTitle"', settings)
        self.assertIn('data-v="default"', settings)
        self.assertIn('data-v="purple"', settings)
        for removed_theme in ("gray", "pink", "cobalt"):
            self.assertNotIn(f'data-v="{removed_theme}"', settings)
        self.assertIn("body.settings-page.tool-page", shell)
        self.assertIn(".settings-page.mobile-settings-index .st-content{display:none}", shell)

    def test_status_page_uses_public_runtime_status_fields(self):
        source = (FRONTEND / "status.html").read_text(encoding="utf-8")
        self.assertIn("fetch(`${API}/status`", source)
        self.assertIn("data.ffmpeg_ready", source)
        self.assertIn("data.cookies_loaded", source)
        self.assertNotIn("fetch(`${API}/health`", source)


if __name__ == "__main__":
    unittest.main()
