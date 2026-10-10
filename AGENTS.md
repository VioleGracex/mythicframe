# Project Rules & AI Guidelines: MythicFrame

This document defines mandatory operational guardrails for AI coding assistants working in this workspace.

---

## 1. Permission Protocol: Zero Unauthorized Edits
* **Do NOT edit, create, or overwrite files without explicit approval**:
  - Present the planned change, affected files, and rationale first.
  - Ask for user confirmation before applying writes or edits (`write_to_file`, `replace_file_content`).
  - Do NOT perform unsolicited refactoring or stylistic reformatting. Keep edits minimal and focused.

## 2. No Over-Analysis
* Keep diagnostics and explanations concise, direct, and focused on the user's specific query.
* Do not produce speculative architecture breakdowns or multi-paragraph essays unless explicitly prompted.
* When searching or inspecting the codebase, read targeted lines and avoid dumping large file contents into the conversation.

## 3. MCP Server & External Tools Usage
* **Fast / Auto-Execute Mode (Default for `/mf-bei`, `/mf-gen`, or direct image generation requests)**:
  - When the user requests an image (e.g. `/mf-bei`, `/mf-gen`, or direct image creation prompts), or when `autoExecuteGeneration` is `true` in `mythic_project.json`:
    - **Do NOT halt** to ask for confirmation or output argument specifications before generating.
    - Execute the MCP generation tool (`mythic_bei_generate` or `mythic_smart_generate`) immediately.
    - Output the complete result (embedded image, clickable file link, file size in MB, dimensions, and parameters used) directly in the final response.
* **Confirmation Guardrails**:
  - Ask for user confirmation when executing bulk generations (> 3 variations at once), when introducing an unrequested new external MCP tool for the first time, or if `autoExecuteGeneration` is explicitly set to `false`.

## 4. Social Media & External Publishing Guardrails
* **Mandatory Confirmation**: Never publish any post or comment to public social platforms without explicit user approval of the exact text and media.
* **Zero Emojis Policy**: Do not use emojis in post text or comments unless explicitly requested by the user.
* **Link Placement**: Never place outbound URLs in the main post text. Always publish outbound links (GitHub repository, articles, docs) in the first comment or reply to prevent algorithmic reach throttling.
* **Dedicated Browser Port**: Always use port `9223` for Brave browser CDP automation to avoid port conflicts with Chrome.

