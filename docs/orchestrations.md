# Orchestrations

This project uses transparent, JSON-defined orchestrations for small follow-up tasks.

## Files

- `src/config/orchestrations/rename-chat.json`
  - Generates a 2-5 word conversation title from the first user/model exchange (single step).
- `src/config/orchestrations/fix-response.json`
  - Critiques, revises, and validates a model response against the originating user prompt (multi-step).

## Runtime behavior

- Orchestrations are step arrays (`steps`) where each step can define:
  - `stepName`
  - `prompt`
  - `parameters`
  - `outputKey` (optional variable name for later step prompts)
  - `responseFormat`
- The app renders prompt templates with `{{...}}` placeholders and sends each step through `LLMEngineClient` in order.
- Each completed step output is available to later steps via:
  - `{{previousStepOutput}}` and `{{lastStepOutput}}`
  - `{{step1Output}}`, `{{step2Output}}`, etc.
  - `{{<outputKey>}}` if that step defines `outputKey`
- `Fix` executes all preparation steps first, then streams the final step output into the transcript as a new response variant.
- `Fix` creates a new model variant at the same turn (like regenerate), so prior variants stay navigable.
