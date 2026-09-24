// Theme and language before the first paint (see src/lib/theme.ts and src/i18n).
// A file rather than an inline script: the Content-Security-Policy (infra/Caddyfile) forbids inline scripts.
(function () {
  try {
    var theme = localStorage.getItem("agora.theme");
    var dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    var locale = localStorage.getItem("agora.locale");
    if (locale === "fr" || locale === "en") document.documentElement.lang = locale;
  } catch (e) {}
})();
