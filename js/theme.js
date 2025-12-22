// theme.js

// Load saved preference
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  document.body.dataset.theme = savedTheme;
} else {
  document.body.dataset.theme = "light";
}

// Toggle theme with money-note icon switch
export function toggleTheme() {
  const current = document.body.dataset.theme === "dark" ? "light" : "dark";
  document.body.dataset.theme = current;
  localStorage.setItem("theme", current);
}

