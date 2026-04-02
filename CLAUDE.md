# Mercia Project Context

## Machine Info
- Mac Mini: /Users/danefroelicher/obsidian-vault
- Windows: C:\Users\danef\Downloads\Programming\Obsidian\Dane Vault

## Obsidian Vault
Dane's personal knowledge base lives at /Users/danefroelicher/obsidian-vault
on this machine. It contains notes on goals, architecture decisions, and
project context across: Daily, Hub, Mercia, JS Learn directories.

## On Every Session Start
Run: git -C /Users/danefroelicher/obsidian-vault pull
Then read relevant vault files before making recommendations.

## SQL Commands
Never create SQL migration files in the codebase. When SQL needs to be run, provide it directly in the chat so it can be copied into the Supabase SQL editor.

## Project Stack
- React Native / Expo (mobile)
- Node.js / Express (backend on Render)
- Supabase (auth + storage)
- Groq (LLM)
- RevenueCat (subscriptions)
- EAS (builds + submission)
- Bundle ID: com.oasisai.app