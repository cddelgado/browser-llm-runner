function resolvePathValue(source, path) {
  if (!path || typeof path !== 'string') {
    return source;
  }
  const keys = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!keys.length) {
    return source;
  }
  let current = source;
  for (const key of keys) {
    if (current == null) {
      return '';
    }
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      current = current[Number.parseInt(key, 10)];
      continue;
    }
    if (typeof current !== 'object' || !(key in current)) {
      return '';
    }
    current = current[key];
  }
  return current ?? '';
}

function stringifyPromptValue(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return '';
    }
    if (
      value.every(
        (item) =>
          typeof item === 'string' ||
          typeof item === 'number' ||
          typeof item === 'boolean' ||
          item == null
      )
    ) {
      return value
        .map((item) => stringifyPromptValue(item))
        .filter(Boolean)
        .join('\n\n');
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function getStepType(step) {
  const rawType = typeof step?.type === 'string' ? step.type.trim() : '';
  if (!rawType) {
    return 'prompt';
  }
  return rawType;
}

function getOrchestrationSteps(orchestration) {
  const steps = Array.isArray(orchestration?.steps) ? orchestration.steps : [];
  if (!steps.length) {
    throw new Error('Invalid orchestration definition.');
  }
  steps.forEach((step, index) => {
    const stepType = getStepType(step);
    if (stepType === 'prompt' || stepType === 'forEach') {
      if (typeof step?.prompt !== 'string' || !step.prompt.trim()) {
        throw new Error(`Invalid orchestration step at index ${index}.`);
      }
      if (stepType === 'forEach') {
        const input = typeof step?.input === 'string' ? step.input.trim() : '';
        if (!input) {
          throw new Error(`Invalid forEach step at index ${index}.`);
        }
      }
      return;
    }
    if (stepType === 'transform') {
      const transform = typeof step?.transform === 'string' ? step.transform.trim() : '';
      const outputKey = typeof step?.outputKey === 'string' ? step.outputKey.trim() : '';
      const source = typeof step?.source === 'string' ? step.source.trim() : '';
      if (!transform || !outputKey || !source) {
        throw new Error(`Invalid transform step at index ${index}.`);
      }
      return;
    }
    if (stepType === 'join') {
      const source = typeof step?.source === 'string' ? step.source.trim() : '';
      const outputKey = typeof step?.outputKey === 'string' ? step.outputKey.trim() : '';
      if (!source || !outputKey) {
        throw new Error(`Invalid join step at index ${index}.`);
      }
      return;
    }
    throw new Error(`Unsupported orchestration step type at index ${index}.`);
  });
  return steps;
}

export function buildOrchestrationPrompt(step, variables = {}) {
  if (!step || typeof step.prompt !== 'string' || !step.prompt.trim()) {
    throw new Error('Invalid orchestration definition.');
  }
  const renderedPrompt = step.prompt.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_match, key) =>
    stringifyPromptValue(resolvePathValue(variables, key))
  );
  const responseInstructions =
    typeof step?.responseFormat?.instructions === 'string'
      ? step.responseFormat.instructions.trim()
      : '';
  if (!responseInstructions) {
    return renderedPrompt.trim();
  }
  return `${renderedPrompt.trim()}\n\nResponse format:\n${responseInstructions}`;
}

function buildChunkPageLabel(startPage, endPage) {
  if (!Number.isFinite(startPage) && !Number.isFinite(endPage)) {
    return '';
  }
  if (Number.isFinite(startPage) && Number.isFinite(endPage)) {
    return startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}-${endPage}`;
  }
  const page = Number.isFinite(startPage) ? startPage : endPage;
  return `Page ${page}`;
}

function normalizeChunkSourceItem(item, index, parameters = {}) {
  const textField =
    typeof parameters?.textField === 'string' && parameters.textField.trim()
      ? parameters.textField.trim()
      : 'text';
  const pageField =
    typeof parameters?.pageField === 'string' && parameters.pageField.trim()
      ? parameters.pageField.trim()
      : 'pageNumber';

  if (typeof item === 'string') {
    return {
      text: item,
      sourceItem: item,
      pageNumber: null,
      sourceIndex: index,
    };
  }
  if (item && typeof item === 'object') {
    const rawText = resolvePathValue(item, textField);
    const rawPageNumber = resolvePathValue(item, pageField);
    const pageNumber = Number.isFinite(rawPageNumber)
      ? rawPageNumber
      : typeof rawPageNumber === 'string' && rawPageNumber.trim()
        ? Number.parseInt(rawPageNumber.trim(), 10)
        : null;
    return {
      text: typeof rawText === 'string' ? rawText : stringifyPromptValue(rawText),
      sourceItem: item,
      pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
      sourceIndex: index,
    };
  }
  return {
    text: stringifyPromptValue(item),
    sourceItem: item,
    pageNumber: null,
    sourceIndex: index,
  };
}

function buildChunkFromEntries(entries, index, totalCount, overlapText = '') {
  const normalizedEntries = entries.filter(
    (entry) => typeof entry?.text === 'string' && entry.text.trim()
  );
  const startPage =
    normalizedEntries.find((entry) => Number.isFinite(entry.pageNumber))?.pageNumber ?? null;
  const endPage =
    [...normalizedEntries].reverse().find((entry) => Number.isFinite(entry.pageNumber))
      ?.pageNumber ?? null;
  const entryText = normalizedEntries.map((entry) => entry.text.trim()).join('\n\n');
  const text = overlapText
    ? `${overlapText}${entryText ? `\n\n${entryText}` : ''}`.trim()
    : entryText;
  return {
    id: `chunk-${index + 1}`,
    text,
    chunkIndex: index + 1,
    chunkCount: totalCount,
    startPage,
    endPage,
    pageLabel: buildChunkPageLabel(startPage, endPage),
    sourceItems: normalizedEntries.map((entry) => entry.sourceItem),
  };
}

function chunkTextValue(input, parameters = {}) {
  const maxChars = Math.max(1, Number.parseInt(String(parameters?.maxChars ?? 4000), 10) || 4000);
  const overlapChars = Math.max(
    0,
    Math.min(maxChars - 1, Number.parseInt(String(parameters?.overlapChars ?? 0), 10) || 0)
  );

  const sourceEntries = Array.isArray(input)
    ? input.map((item, index) => normalizeChunkSourceItem(item, index, parameters))
    : [normalizeChunkSourceItem(String(input ?? ''), 0, parameters)];
  const filteredEntries = sourceEntries.filter(
    (entry) => typeof entry.text === 'string' && entry.text.trim()
  );
  if (!filteredEntries.length) {
    return [];
  }

  /** @type {Array<any>} */
  const chunks = [];
  /** @type {Array<any>} */
  let currentEntries = [];
  let currentLength = 0;

  function flushChunk() {
    if (!currentEntries.length) {
      return;
    }
    let overlapText = '';
    if (overlapChars > 0 && chunks.length > 0) {
      const previousChunkText =
        typeof chunks[chunks.length - 1]?.text === 'string' ? chunks[chunks.length - 1].text : '';
      overlapText = previousChunkText.slice(-overlapChars).trim();
    }
    chunks.push(buildChunkFromEntries(currentEntries, chunks.length, 0, overlapText));
    currentEntries = [];
    currentLength = 0;
  }

  filteredEntries.forEach((entry) => {
    const entryText = entry.text.trim();
    if (!entryText) {
      return;
    }
    if (entryText.length > maxChars) {
      flushChunk();
      let start = 0;
      while (start < entryText.length) {
        const sliceEnd = Math.min(entryText.length, start + maxChars);
        const sliceText = entryText.slice(start, sliceEnd).trim();
        if (sliceText) {
          const overlapText =
            overlapChars > 0 && chunks.length > 0
              ? String(chunks[chunks.length - 1]?.text || '')
                  .slice(-overlapChars)
                  .trim()
              : '';
          chunks.push(
            buildChunkFromEntries(
              [
                {
                  ...entry,
                  text: sliceText,
                },
              ],
              chunks.length,
              0,
              overlapText
            )
          );
        }
        if (sliceEnd >= entryText.length) {
          break;
        }
        start = Math.max(sliceEnd - overlapChars, start + 1);
      }
      return;
    }

    const separatorLength = currentEntries.length ? 2 : 0;
    if (currentLength + separatorLength + entryText.length > maxChars) {
      flushChunk();
    }
    currentEntries.push(entry);
    currentLength += (currentEntries.length > 1 ? 2 : 0) + entryText.length;
  });

  flushChunk();
  const chunkCount = chunks.length;
  return chunks.map((chunk, index) => ({
    ...chunk,
    chunkIndex: index + 1,
    chunkCount,
  }));
}

function runTransformStep(step, promptVariables) {
  const transformName = step.transform.trim();
  const sourceValue = resolvePathValue(promptVariables, step.source.trim());

  if (transformName === 'chunkText') {
    return chunkTextValue(sourceValue, step.parameters);
  }

  throw new Error(`Unsupported orchestration transform: ${transformName}`);
}

function runJoinStep(step, promptVariables) {
  const sourceValue = resolvePathValue(promptVariables, step.source.trim());
  if (!Array.isArray(sourceValue)) {
    return stringifyPromptValue(sourceValue);
  }
  const separator = typeof step?.separator === 'string' ? step.separator : '\n';
  return sourceValue
    .map((item) => stringifyPromptValue(item))
    .filter(Boolean)
    .join(separator);
}

function assignStepOutputs(promptVariables, index, stepOutput, outputKey = '') {
  const lastOutput = Array.isArray(stepOutput)
    ? stringifyPromptValue(stepOutput.at(-1))
    : stringifyPromptValue(stepOutput);
  const outputs = Array.isArray(stepOutput) ? stepOutput : [stepOutput];
  promptVariables.previousStepOutput = lastOutput;
  promptVariables.lastStepOutput = lastOutput;
  promptVariables[`step${index + 1}Output`] = lastOutput;
  promptVariables.previousStepOutputs = outputs;
  promptVariables.lastStepOutputs = outputs;
  promptVariables[`step${index + 1}Outputs`] = outputs;
  if (outputKey) {
    promptVariables[outputKey] = stepOutput;
  }
}

/**
 * @param {{
 *   generateText: (prompt: string, options?: { signal?: AbortSignal }) => Promise<string>;
 *   formatStepOutput?: (step: any, rawOutput: string) => string;
 *   onDebug?: (message: string) => void;
 * }} dependencies
 */
export function createOrchestrationRunner(dependencies) {
  const generateText = dependencies?.generateText;
  const formatStepOutput =
    typeof dependencies?.formatStepOutput === 'function'
      ? dependencies.formatStepOutput
      : (_step, rawOutput) => String(rawOutput || '').trim();
  const onDebug =
    typeof dependencies?.onDebug === 'function' ? dependencies.onDebug : (_message) => {};

  if (typeof generateText !== 'function') {
    throw new Error('Orchestration runner requires a generateText function.');
  }

  return async function runOrchestration(orchestration, variables = {}, options = {}) {
    const orchestrationId =
      typeof orchestration?.id === 'string' ? orchestration.id : 'unnamed-orchestration';
    const runFinalStep = options?.runFinalStep !== false;
    const steps = getOrchestrationSteps(orchestration);
    /** @type {Record<string, any>} */
    const promptVariables = { ...variables };

    onDebug(`Orchestration started: ${orchestrationId} (${steps.length} steps)`);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepType = getStepType(step);
      const stepName =
        typeof step?.stepName === 'string' && step.stepName.trim()
          ? step.stepName.trim()
          : `Step ${index + 1}`;
      const isFinalStep = index === steps.length - 1;
      const outputKey = typeof step?.outputKey === 'string' ? step.outputKey.trim() : '';

      if (stepType === 'prompt') {
        const stepPrompt = buildOrchestrationPrompt(step, promptVariables);
        if (isFinalStep && !runFinalStep) {
          onDebug(`Orchestration prepared final step: ${orchestrationId} [${stepName}]`);
          onDebug(`Orchestration completed: ${orchestrationId}`);
          return {
            finalPrompt: stepPrompt,
            finalOutput: '',
          };
        }

        onDebug(
          `Orchestration step ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`
        );
        const rawStepOutput = await generateText(stepPrompt, {
          signal: options?.signal,
        });
        const stepOutput = formatStepOutput(step, rawStepOutput);
        assignStepOutputs(promptVariables, index, stepOutput, outputKey);

        if (isFinalStep) {
          onDebug(`Orchestration completed: ${orchestrationId}`);
          return {
            finalPrompt: stepPrompt,
            finalOutput: stepOutput,
          };
        }
        continue;
      }

      if (stepType === 'transform') {
        onDebug(
          `Orchestration utility ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`
        );
        const stepOutput = runTransformStep(step, promptVariables);
        assignStepOutputs(promptVariables, index, stepOutput, outputKey);
        if (isFinalStep) {
          onDebug(`Orchestration completed: ${orchestrationId}`);
          return {
            finalPrompt: '',
            finalOutput: stepOutput,
          };
        }
        continue;
      }

      if (stepType === 'join') {
        onDebug(
          `Orchestration utility ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`
        );
        const stepOutput = runJoinStep(step, promptVariables);
        assignStepOutputs(promptVariables, index, stepOutput, outputKey);
        if (isFinalStep) {
          onDebug(`Orchestration completed: ${orchestrationId}`);
          return {
            finalPrompt: '',
            finalOutput: stepOutput,
          };
        }
        continue;
      }

      if (stepType === 'forEach') {
        const items = resolvePathValue(promptVariables, step.input.trim());
        if (!Array.isArray(items)) {
          throw new Error(`forEach input is not an array: ${step.input}`);
        }
        onDebug(
          `Orchestration step ${index + 1}/${steps.length}: ${orchestrationId} [${stepName}]`
        );
        const itemName =
          typeof step?.itemName === 'string' && step.itemName.trim()
            ? step.itemName.trim()
            : 'item';
        const outputs = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
          const item = items[itemIndex];
          const itemVariables = {
            ...promptVariables,
            [itemName]: item,
            itemIndex,
            itemNumber: itemIndex + 1,
            itemCount: items.length,
          };
          const itemPrompt = buildOrchestrationPrompt(step, itemVariables);
          const rawStepOutput = await generateText(itemPrompt, {
            signal: options?.signal,
          });
          const stepOutput = formatStepOutput(step, rawStepOutput);
          outputs.push(stepOutput);
        }
        assignStepOutputs(promptVariables, index, outputs, outputKey);
        if (isFinalStep) {
          onDebug(`Orchestration completed: ${orchestrationId}`);
          return {
            finalPrompt: '',
            finalOutput: outputs,
          };
        }
        continue;
      }
    }

    throw new Error('Invalid orchestration definition.');
  };
}
