---
name: Persona Modern Dark
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c7c8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c6c6c7'
  primary: '#ffffff'
  on-primary: '#2f3131'
  primary-container: '#e2e2e2'
  on-primary-container: '#636565'
  inverse-primary: '#5d5f5f'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b4b4'
  tertiary: '#ffffff'
  on-tertiary: '#303030'
  tertiary-container: '#e4e2e1'
  on-tertiary-container: '#656464'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c7'
  on-primary-fixed: '#1a1c1c'
  on-primary-fixed-variant: '#454747'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2e1'
  tertiary-fixed-dim: '#c8c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  text-primary: '#ececec'
  text-muted: '#8E8EA0'
  border-subtle: '#262626'
  accent-blue: '#0000EE'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  code:
    fontFamily: jetbrainsMono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max-width: 800px
  sidebar-width: 260px
  gutter: 1.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style

The design system is centered on a "Focus-First" philosophy, prioritizing the conversational flow above all else. The brand personality is professional, intellectual, and unobtrusive—acting as a high-end tool that recedes into the background to let the user's thoughts and the AI's responses take center stage.

The aesthetic leans heavily into **Minimalism** with a touch of **Glassmorphism**. By using deep charcoal tones and crisp, high-contrast typography, the UI creates a serene environment for deep work. It avoids the clutter of traditional dashboards, favoring generous whitespace (or "dark space") and razor-sharp execution of layout.

## Colors

The palette is strictly monochromatic, utilizing subtle shifts in value to create hierarchy rather than hue. 

- **Primary Background**: The base is `#0d0d0d`, providing a deep, ink-like canvas that minimizes eye strain.
- **Surface Elevation**: Secondary elements like the sidebar or message bubbles use `#171717`.
- **Primary Action**: White (`#FFFFFF`) is reserved for high-priority interactions and primary text to ensure maximum legibility.
- **Muted Elements**: Secondary text and non-interactive icons use `#8E8EA0`, ensuring they do not compete for attention.
- **Borders**: All structural divisions are defined by a very low-contrast `#262626` border, maintaining a "borderless" feel while providing just enough structure.

## Typography

This design system utilizes **Geist** for its technical precision and modern, grotesque aesthetic. The typeface is optimized for screen readability and provides a "developer-centric" clarity that fits the AI persona.

For code snippets—a critical part of the conversational experience—**JetBrains Mono** is employed to provide distinct character separation. 

Text hierarchy is strictly enforced:
- **Headlines** use semi-bold weights and tighter letter spacing for a compact, authoritative look.
- **Body text** uses a generous line height (1.5x) to facilitate long-form reading without fatigue.
- **Labels** are treated with uppercase transformations and tracking to distinguish them from prose.

## Layout & Spacing

The layout uses a **Fixed-Fluid hybrid model**:
- **Navigation**: A fixed-width sidebar (260px) on the left for history and settings.
- **Content**: A centered, fixed-width chat column (max 800px) that ensures line lengths remain optimal for reading (60-80 characters).
- **Responsive Reflow**: On mobile, the sidebar becomes a hidden drawer, and the main chat container takes 100% of the viewport with 16px horizontal margins.

The spacing rhythm is based on an **8px grid**. Consistent padding within message bubbles and between conversational turns ensures the UI feels balanced and rhythmic.

## Elevation & Depth

Depth is conveyed through **Tonal Layering** and **Low-Contrast Outlines** rather than traditional shadows.

1.  **Level 0 (Background)**: `#0d0d0d` - The root application canvas.
2.  **Level 1 (Surface)**: `#171717` - Navigation sidebars and modal overlays.
3.  **Level 2 (Active/Interactive)**: `#212121` - Hover states and active input fields.

Visual separation is achieved through 1px borders of `#262626`. Where a floating effect is required (e.g., tooltips), a subtle backdrop blur of 10px is applied to the surface to create a "glass" effect that maintains context of the text underneath.

## Shapes

The shape language is **Refined and Modern (Rounded)**. 

- **Containers**: Standard UI elements like cards and input fields use a `0.5rem` (8px) radius.
- **Interactive Elements**: Buttons and pill-style chips use `rounded-xl` (24px) to make them feel approachable and distinct from structural containers.
- **User Avatars**: Use a standard `0.25rem` (4px) soft-square radius to maintain a professional, slightly more technical appearance than a circle.

## Components

### Buttons
- **Primary**: Solid `#FFFFFF` background with `#0d0d0d` text. No border.
- **Secondary**: Ghost style with `#262626` border and `#FFFFFF` text.
- **Tertiary/Action**: Transparent background, `#8E8EA0` text, appearing on hover to reduce visual noise.

### Chat Input
The input is a "floating" rounded bar at the bottom of the viewport. It features a subtle `1px` border of `#2f2f2f` and uses a background of `#171717`. It expands vertically with text but maintains a maximum height.

### Message Bubbles
Messages do not use heavy bubbles. Instead, they use a "row-based" layout:
- **User**: Simple right-aligned text or subtle right-indented container.
- **AI**: Full-width with a slightly different background color (`#171717`) or a small brand icon to the left.

### Chips & Tags
Used for suggested prompts. They feature a `0.5rem` radius, `#171717` background, and a `#2f2f2f` border. On hover, the border brightens to `#8E8EA0`.

### Lists
Sidebar history items use a `body-sm` typography. Active items are highlighted with a `#171717` background and a small white indicator bar on the far left.