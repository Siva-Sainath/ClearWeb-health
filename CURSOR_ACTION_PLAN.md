# Clearweb Health — Step-by-Step UI/UX Engineering Plan (Cursor / Agent Playbook)

This document provides exact, sequential instructions for an AI coding agent to implement the **Frontier UI/UX & Dynamic Spatial Orchestration** in Clearweb Health.

---

## 🎯 Architecture Goals
1. **Dynamic Stage Morphing (`layoutId`):** Replace static glass cards with a **Dense Horizon Matrix** that morphs smoothly into a **Full-Window Expansive Stage** when clicked or activated by the LLM brain.
2. **LLM Orchestration Bridge:** Equip the autonomous agent (Aria) with tool-calling capabilities to expand viewports (`expand_viewport_stage`), switch layouts (`stageFocus`), and morph charts.
3. **Editorial Typography & Data Density:** Integrate Fraunces display typography, IBM Plex Mono tabular numbers, and clinical quality badges to break away from "vibe-coded AI dark mode".
4. **Living Procedural Ambient Layers:** Introduce an ambient kinetic light field and video preview layers that enhance depth without degrading STT/TTS latency.

---

## 📋 Step-by-Step Execution Plan

### Step 1: Create `DynamicHospitalStage.tsx`
* **File:** `frontend/src/components/DynamicHospitalStage.tsx`
* **Purpose:** The core spatial workspace. Contains:
  1. **Horizon Matrix:** Compact 3-column rows for unselected facilities with ranks, distance, wait times, and verified prices.
  2. **Full-Window Stage:** An expansive, modal-less workspace that animates from the clicked row using Framer Motion `layoutId`. Displays high-res exterior photography/video, in-network vs. cash vs. gross chargemaster price breakdown, Joint Commission quality accreditation, driving route HUD, and 1-click booking/calling actions.

### Step 2: Extend UI Actions & Dashboard Context
* **Files:** 
  * `frontend/src/lib/uiActions.ts`
  * `frontend/src/context/DashboardContext.tsx`
* **Changes:**
  * Add `"stageFocus"` to `LayoutMode`.
  * Support `expand_stage` UIAction type.
  * Update `DashboardProvider` reducer to handle smooth stage transitions.

### Step 3: Upgrade Backend Brain UI Tool Schema
* **File:** `backend/services/uiToolSchema.js`
* **Changes:**
  * Add `expand_viewport_stage` tool definition (parameters: `facilityId`, `depth`).
  * Add `stageFocus` to `set_layout` enum.
  * Map `expand_viewport_stage` in `toolCallToUiAction`.

### Step 4: Integrate Stage into `ResultsLayoutShell.tsx` & `ResultsView.tsx`
* **Files:**
  * `frontend/src/components/ResultsLayoutShell.tsx`
  * `frontend/src/components/ResultsView.tsx`
* **Changes:**
  * Swap static `ConsumerOptionCard` list for `DynamicHospitalStage`.
  * Wire up spotlight, booking, calling, and route handlers.
  * Add ESC key listener to exit stage expansion.

### Step 5: Upgrade Ambient Canvas in `WebBackground.tsx`
* **File:** `frontend/src/components/WebBackground.tsx`
* **Changes:**
  * Add a high-performance procedural particle / aurora light canvas that reacts to mouse position and ambient phase with zero DOM overhead.

### Step 6: Verify and Validate
* **Commands:**
  * Run Next.js type-check / build to ensure zero TypeScript errors or regressions.
