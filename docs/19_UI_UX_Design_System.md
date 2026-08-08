# UI/UX Design System: Layout & Usability Guidelines

## 1. Visual Layout Principles & Grid Structure

### 1.1. Grid Layout Systems
The system uses a responsive 12-column flexbox grid designed around a clean 8px spacing system, ensuring layout consistency across all viewports.

*   **Spacing Units:** All padding, margins, gaps, and sizes are calculated using multiples of 8px (e.g., 4px (xxs), 8px (xs), 16px (sm), 24px (md), 32px (lg), 64px (xl)).
*   **Desktop Layout Structure:**
    *   *Workspace Sidebars:* Fixed 260px navigation panels.
    *   *Dynamic Coding Pane:* Stretches to fill remaining space, splitting 50/50 between the editor and instructions.
    *   *Real-time Conversation Panel:* Placed in a sticky sidebar (380px) to keep critical audio controls easily accessible during sessions.

```text
+-----------------------------------------------------------------------------------+
| Logo | Nav Menu                                                   | Clara Profile |
+-----------------------------------------------------------------------------------+
| Navigation  | Coding Workspace (Split Pane)                | Voice Panel (Sticky) |
| Dashboard   | +--------------------+---------------------+ | +------------------+ |
| Sessions    | | Monaco Editor      | Test Suite Outputs  | | | Audio Waveform   | |
| Roadmaps    | |                    |                     | | | (Framer Motion)  | |
| Settings    | |                    |                     | | |                  | |
|             | |                    |                     | | | "Speak Now" VAD  | |
|             | +--------------------+---------------------+ | +------------------+ |
+-------------+----------------------------------------------+----------------------+
```

---

## 2. Premium Design Tokens & Aesthetics
The design system features a premium, glassmorphism-influenced dark mode to provide a modern, high-tech experience.

### 2.1. Dark Mode Specifications
We choose dark themes to reduce eye strain during long mock interview sessions.
*   **Background (Soot Dark):** `#0B0C10` - Deep, low-contrast black base.
*   **Surface (Obsidian Dark):** `#1F2833` - Used for primary cards, sidebars, and panels.
*   **Accent Color (Aurora Blue):** `#45A29E` - Highlights active items, buttons, and system statuses.
*   **Contrast / Text (Frost White):** `#C5C6C7` - Crisp white for body copy and icons.

---

## 3. Responsive Breakpoints

| Breakpoint Name | Minimum Width | Column Count | Primary Container Max-Width | Target Devices |
| :--- | :--- | :--- | :--- | :--- |
| **sm** | 640px | 4 columns | 100% | Mobile Landscape |
| **md** | 768px | 8 columns | 720px | Tablets (Portrait) |
| **lg** | 1024px | 12 columns | 960px | Tablets (Landscape) / Netbooks |
| **xl** | 1280px | 12 columns | 1200px | Standard Laptops & Desktops |
| **2xl** | 1536px | 12 columns | 1440px | High-Res Monitors |

---

## 4. Accessibility Standards & WCAG 2.1 AAA
*   **Contrast Ratio:** Color combinations for text must maintain a minimum contrast ratio of `4.5:1` for regular text and `3:1` for large text, adhering to WCAG 2.1 AAA guidelines.
*   **Keyboard Navigation:** All button actions, Monaco Code editor states, and voice triggers must be fully accessible via keyboard navigation.
*   **ARIA Accessibility Tags:** Screen readers are supported through proper ARIA labels (e.g., `aria-live="polite"` on chat transcripts and `aria-label="Start Voice Recording"` on buttons).
*   **Focus States:** Focused interactive elements display a clear, high-contrast outline (`outline: 2px solid #66FCF1`) to aid keyboard navigation.
