# AI Skills

A curated collection of AI skill files (`.md`) that can be used with any AI tool that supports skills — such as GitHub Copilot, Cursor, Windsurf, Cline, claude and others.

---

## What Are AI Skills?

AI skills are structured Markdown files that provide an AI assistant with domain-specific knowledge, guidelines, and instructions. When loaded into a compatible AI tool, a skill file shapes how the AI behaves, responds, and writes code within a particular context.

Think of a skill as a **reusable prompt blueprint** — instead of repeating detailed instructions every time you interact with an AI, you define them once in a `.md` file and let the tool apply them automatically.

---

## Benefits

- **Consistency** — Ensure the AI follows the same conventions, patterns, and best practices across your entire team.
- **Reusability** — Write a skill once and share it across projects, teams, or the wider community.
- **Domain Expertise** — Encode specialised knowledge (testing strategies, framework conventions, coding standards) so the AI produces higher-quality output from the start.
- **Onboarding** — New team members get AI assistance that already understands your project's rules and patterns.
- **Time Saving** — Eliminate repetitive prompt engineering; the skill file does the heavy lifting.
- **Tool Agnostic** — Because skills are plain Markdown, they work with any AI tool that supports the concept (Copilot custom instructions, Cursor rules, etc.).

---

## How to Use

### For Technical People (Developers / QA / DevOps)

Use skills by integrating them directly into your AI-powered IDE or tool so every coding session follows the defined conventions automatically.

#### Option A — Add to Your AI Tool's Configuration

Each AI tool has its own way of loading skills:

| AI Tool | Where to Place the Skill File |
|---|---|
| **GitHub Copilot** | Add as a custom instruction file in `.github/copilot-instructions.md` or reference it in your Copilot settings. |
| **Cursor** | Place the file in `.cursor/rules/` or add its content to **Settings → Rules**. |
| **Windsurf** | Add the file to `.windsurf/rules/` or configure it in the tool's settings. |
| **Cline / Other Tools** | Follow the tool's documentation for loading custom instructions or system prompts. |

Once the skill is loaded, the AI assistant will automatically follow the instructions defined in the skill file during your coding sessions.

#### Option B — Copy & Paste into Any AI Chat

1. Open the skill `.md` file you need (e.g., `BDD-Test-case-SKILL.md`).
2. **Copy the entire content** of the file.
3. **Paste it into any AI tool** — GitHub Copilot Chat, ChatGPT, Claude, Gemini, or any other LLM.
4. After pasting, send your actual request (e.g., _"Generate BDD test cases for the login feature"_).

The AI will follow the structure, format, and rules defined in the skill for that conversation.

#### Customise & Contribute

- Feel free to modify any skill to better fit your project's needs.
- Contributions of new skills are welcome — just add a well-structured `.md` file and open a merge request.

---

### For Business People (Product Owners / Business Analysts / Managers)

You don't need a developer IDE — you can use these skills with **any AI assistant** you already have access to (ChatGPT, Claude, Gemini, Microsoft Copilot, etc.).

#### Steps

1. **Browse this repository** and find the skill that matches what you need (e.g., `Draft-Acceptance-Criteria-SKILL.md` for writing tickets).
2. **Click on the skill file** and copy its entire content (use the "Copy raw file" button or select all → copy).
3. **Open your favourite AI tool** — ChatGPT, Claude, Gemini, Microsoft Copilot, or any other.
4. **Paste the copied skill content** into the chat as your first message (or as a system/custom instruction if the tool supports it).
5. **Then type your actual request** in the next message, for example:
   - _"Draft acceptance criteria for a password-reset feature"_
   - _"Generate BDD test cases for the shopping cart checkout"_
6. The AI will respond **following the exact format, structure, and guidelines** defined in the skill.

#### Example Workflow

```
┌─────────────────────────────────────────────┐
│  1. Copy skill content from this repo       │
│  2. Paste into ChatGPT / Claude / Gemini    │
│  3. Ask your question                       │
│  4. Get a structured, high-quality response │
└─────────────────────────────────────────────┘
```

> **Tip:** You can save the skill text as a "Custom Instruction" or "System Prompt" in tools that support it — that way you don't need to paste it every time.

---

## Available Skills — Quick Reference

| # | Skill | Description | Trigger Words / Sentences |
|---|-------|-------------|---------------------------|
| 1 | **BDD Test Case Architect** (`BDD-Test-case-SKILL.md`) | Generates BDD-style test scenarios (Given/When/Then) for your requirements and distributes them across the Testing Pyramid — Unit, API, and UI/E2E. Also covers security & performance checks with zero test redundancy. | _"Generate BDD test cases for …"_ · _"Create test scenarios for this requirement"_ · _"Write testing pyramid tests"_ · _"BDD test case"_ · _"test strategy for …"_ |
| 2 | **MCP TypeScript Server** (`Create-MCP-Server-SKILL.md`) | Scaffolds a production-grade MCP (Model Context Protocol) server in TypeScript using the low-level SDK, following SOLID principles and clean architecture. Supports Stdio and HTTPS transports. | _"Create an MCP server"_ · _"Build a tool for Claude"_ · _"MCP server in TypeScript"_ · _"Add MCP tools"_ · _"Model Context Protocol"_ · _"MCP resource"_ |
| 3 | **Draft Acceptance Criteria** (`Draft-Acceptance-Criteria-SKILL.md`) | Helps Product Owners turn raw requirements into well-structured tickets with positive and negative acceptance criteria in Given/When/Then format. Includes worked calculation examples when applicable. | _"Draft acceptance criteria for …"_ · _"Write AC for this requirement"_ · _"Draft a ticket"_ · _"Define acceptance criteria"_ · _"Write a user story with AC"_ |

> **Tip:** You don't need to use the exact phrases above — they are examples. Any message that conveys the same intent will activate the corresponding skill when it is loaded in your AI tool.

---

## Repository Structure

```
ai-skills/
├── README.md          # This file
├── skill-name.md      # Individual AI skill files
├── ...
```

Each skill file is a self-contained Markdown document with clear instructions that an AI tool can interpret and follow.

---

## Contributing

1. Fork or clone this repository.
2. Create a new `.md` file for your skill with a descriptive name (e.g., `playwright-testing.md`).
3. Follow a clear structure: purpose, guidelines, examples, and any constraints.
4. Open a merge request for review.

---

## License

This project is for internal use. Refer to your organisation's policies for sharing and distribution.
