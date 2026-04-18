import {
  assertValidCustomOrchestration,
  buildCustomOrchestrationCollectionExportFileName,
  buildCustomOrchestrationCollectionExportPayload,
  buildCustomOrchestrationExportFileName,
  buildCustomOrchestrationExportPayload,
  buildCustomOrchestrationTemplate,
  buildSlashCommandLabel,
  formatOrchestrationDefinition,
  normalizeCustomOrchestrations,
  normalizeSlashCommandName,
  parseCustomOrchestrationImportText,
} from '../orchestrations/custom-orchestrations.js';
import {
  buildOrchestrationStepFlow,
  buildOrchestrationStepForTypeChange,
  buildOrchestrationStepTemplate,
  cloneOrchestrationDefinition,
  formatOptionalJsonObject,
  normalizeOrchestrationStepType,
  parseOptionalJsonObjectText,
  parseOrchestrationDefinitionText,
  validateOrchestrationDefinitionForEditor,
} from '../orchestrations/orchestration-step-editor.js';

/**
 * @param {Element | EventTarget | null | undefined} element
 * @returns {element is HTMLElement}
 */
function isElement(element) {
  return element instanceof HTMLElement;
}

/**
 * @param {EventTarget | null | undefined} element
 * @returns {element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement}
 */
function isFormField(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

/**
 * @param {any} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createControlId(stepIndex, fieldName) {
  return `orchestrationStep${stepIndex}-${fieldName}`;
}

function buildStepDisplayName(step, stepIndex) {
  return typeof step?.stepName === 'string' && step.stepName.trim()
    ? step.stepName.trim()
    : `Step ${stepIndex + 1}`;
}

function buildStepTypeLabel(stepType) {
  if (stepType === 'transform') {
    return 'Transform';
  }
  if (stepType === 'forEach') {
    return 'For each';
  }
  if (stepType === 'join') {
    return 'Join';
  }
  return 'Prompt';
}

function replaceLineEndings(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

/**
 * @param {HTMLElement} container
 * @param {Document} documentRef
 * @param {{
 *   columnClass?: string;
 *   label?: string;
 *   control: HTMLElement;
 *   helpText?: string;
 * }} options
 */
function appendField(container, documentRef, { columnClass = 'col-12', label = '', control, helpText = '' }) {
  const column = documentRef.createElement('div');
  column.className = columnClass;

  if (label) {
    const labelElement = documentRef.createElement('label');
    labelElement.className = 'form-label';
    const controlId = isElement(control) ? control.id : '';
    if (controlId) {
      labelElement.htmlFor = controlId;
    }
    labelElement.textContent = label;
    column.appendChild(labelElement);
  }

  column.appendChild(control);

  const normalizedHelpText = typeof helpText === 'string' ? helpText.trim() : '';
  if (normalizedHelpText) {
    const help = documentRef.createElement('p');
    help.className = 'form-text mb-0';
    help.textContent = normalizedHelpText;
    column.appendChild(help);
  }

  container.appendChild(column);
}

/**
 * @param {Document} documentRef
 * @param {{
 *   id: string;
 *   stepIndex: number;
 *   fieldName: string;
 *   value?: string;
 *   rows?: number;
 *   json?: boolean;
 *   placeholder?: string;
 * }} options
 */
function createTextareaControl(
  documentRef,
  { id, stepIndex, fieldName, value = '', rows = 3, json = false, placeholder = '' }
) {
  const control = documentRef.createElement('textarea');
  control.id = id;
  control.className = `form-control${json ? ' font-monospace' : ''}`;
  control.rows = rows;
  control.spellcheck = false;
  control.value = value;
  control.placeholder = placeholder;
  control.dataset.orchestrationStepIndex = String(stepIndex);
  control.dataset.orchestrationStepField = fieldName;
  if (json) {
    control.dataset.orchestrationStepJson = 'true';
  }
  return control;
}

/**
 * @param {Document} documentRef
 * @param {{
 *   id: string;
 *   stepIndex: number;
 *   fieldName: string;
 *   value?: string;
 *   type?: string;
 *   inputMode?: string;
 *   placeholder?: string;
 * }} options
 */
function createInputControl(
  documentRef,
  { id, stepIndex, fieldName, value = '', type = 'text', inputMode = '', placeholder = '' }
) {
  const control = documentRef.createElement('input');
  control.id = id;
  control.className = 'form-control';
  control.type = type;
  control.value = value;
  control.placeholder = placeholder;
  control.autocomplete = 'off';
  control.dataset.orchestrationStepIndex = String(stepIndex);
  control.dataset.orchestrationStepField = fieldName;
  if (inputMode) {
    control.inputMode = inputMode;
  }
  return control;
}

/**
 * @param {Document} documentRef
 * @param {{
 *   id: string;
 *   stepIndex: number;
 *   fieldName: string;
 *   value: string;
 *   options: Array<{ value: string; label: string; }>;
 * }} options
 */
function createSelectControl(documentRef, { id, stepIndex, fieldName, value, options }) {
  const control = documentRef.createElement('select');
  control.id = id;
  control.className = 'form-select';
  control.dataset.orchestrationStepIndex = String(stepIndex);
  control.dataset.orchestrationStepField = fieldName;
  options.forEach((option) => {
    const optionElement = documentRef.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    control.appendChild(optionElement);
  });
  control.value = value;
  return control;
}

/**
 * @param {Document} documentRef
 * @param {{
 *   id: string;
 *   stepIndex: number;
 *   fieldName: string;
 *   checked: boolean;
 *   label: string;
 * }} options
 */
function createCheckboxField(documentRef, { id, stepIndex, fieldName, checked, label }) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'form-check mt-1';

  const input = documentRef.createElement('input');
  input.id = id;
  input.className = 'form-check-input';
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.orchestrationStepIndex = String(stepIndex);
  input.dataset.orchestrationStepField = fieldName;
  input.dataset.orchestrationStepBoolean = 'true';
  wrapper.appendChild(input);

  const labelElement = documentRef.createElement('label');
  labelElement.className = 'form-check-label';
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  wrapper.appendChild(labelElement);

  return wrapper;
}

/**
 * @param {Document} documentRef
 * @param {string} token
 */
function createFlowToken(documentRef, token) {
  const tokenElement = documentRef.createElement('code');
  tokenElement.className = 'orchestration-flow-token';
  tokenElement.textContent = token;
  return tokenElement;
}

/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   orchestrationEditorHeading?: HTMLElement | null;
 *   orchestrationEditorForm?: HTMLFormElement | null;
 *   orchestrationEditorIdInput?: HTMLInputElement | null;
 *   orchestrationNameInput?: HTMLInputElement | null;
 *   orchestrationSlashCommandInput?: HTMLInputElement | null;
 *   orchestrationDescriptionInput?: HTMLTextAreaElement | HTMLInputElement | null;
 *   orchestrationDefinitionInput?: HTMLTextAreaElement | null;
 *   orchestrationStepList?: HTMLElement | null;
 *   orchestrationStepEditorFeedback?: HTMLElement | null;
 *   orchestrationSaveButton?: HTMLButtonElement | null;
 *   orchestrationResetButton?: HTMLButtonElement | null;
 *   orchestrationImportInput?: HTMLInputElement | null;
 *   orchestrationImportFeedback?: HTMLElement | null;
 *   customOrchestrationsList?: HTMLElement | null;
 *   builtInOrchestrationsList?: HTMLElement | null;
 *   builtInOrchestrations?: any[];
 *   saveCustomOrchestration?: ((record: any) => Promise<any>) | null;
 *   removeCustomOrchestration?: ((orchestrationId: string) => Promise<boolean>) | null;
 *   downloadFile?: ((blob: Blob, fileName: string) => void) | null;
 * }} options
 */
export function createOrchestrationPreferencesController({
  appState,
  documentRef = document,
  orchestrationEditorHeading = null,
  orchestrationEditorForm = null,
  orchestrationEditorIdInput = null,
  orchestrationNameInput = null,
  orchestrationSlashCommandInput = null,
  orchestrationDescriptionInput = null,
  orchestrationDefinitionInput = null,
  orchestrationStepList = null,
  orchestrationStepEditorFeedback = null,
  orchestrationSaveButton = null,
  orchestrationResetButton = null,
  orchestrationImportInput = null,
  orchestrationImportFeedback = null,
  customOrchestrationsList = null,
  builtInOrchestrationsList = null,
  builtInOrchestrations = [],
  saveCustomOrchestration = null,
  removeCustomOrchestration = null,
  downloadFile = null,
}) {
  const normalizedBuiltInOrchestrations = Array.isArray(builtInOrchestrations)
    ? builtInOrchestrations
        .filter((record) => record && typeof record === 'object' && record.definition)
        .map((record) => ({
          id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : 'built-in',
          name:
            typeof record.name === 'string' && record.name.trim()
              ? record.name.trim()
              : 'App Orchestration',
          description:
            typeof record.description === 'string' && record.description.trim()
              ? record.description.trim()
              : '',
          usageLabel:
            typeof record.usageLabel === 'string' && record.usageLabel.trim()
              ? record.usageLabel.trim()
              : 'App managed',
          definition: record.definition,
        }))
    : [];

  let currentDefinitionDraft = cloneOrchestrationDefinition(buildCustomOrchestrationTemplate());
  let isStructuredEditorLocked = false;

  function getCustomOrchestrations() {
    return normalizeCustomOrchestrations(appState.customOrchestrations);
  }

  function getStructuredEditorAddButtons() {
    return isElement(orchestrationEditorForm)
      ? Array.from(orchestrationEditorForm.querySelectorAll('button[data-orchestration-add-step]'))
      : [];
  }

  function setStructuredEditorLocked(value) {
    isStructuredEditorLocked = Boolean(value);
    getStructuredEditorAddButtons().forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = isStructuredEditorLocked;
      }
    });
    if (isElement(orchestrationStepList)) {
      orchestrationStepList.classList.toggle(
        'orchestration-step-list-disabled',
        isStructuredEditorLocked
      );
      Array.from(
        orchestrationStepList.querySelectorAll('button, input, select, textarea')
      ).forEach((element) => {
        if (
          element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          element.disabled = isStructuredEditorLocked;
        }
      });
    }
  }

  function setStepEditorFeedback(message = '', variant = 'secondary') {
    if (!isElement(orchestrationStepEditorFeedback)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    orchestrationStepEditorFeedback.className = '';
    orchestrationStepEditorFeedback.replaceChildren();
    if (!normalizedMessage) {
      orchestrationStepEditorFeedback.classList.add('d-none');
      orchestrationStepEditorFeedback.removeAttribute('role');
      return;
    }
    orchestrationStepEditorFeedback.classList.remove('d-none');
    orchestrationStepEditorFeedback.setAttribute(
      'role',
      variant === 'danger' ? 'alert' : 'status'
    );
    orchestrationStepEditorFeedback.classList.add(
      'alert',
      variant === 'danger'
        ? 'alert-danger'
        : variant === 'warning'
          ? 'alert-warning'
          : 'alert-secondary',
      'py-2',
      'px-3',
      'mb-0'
    );
    orchestrationStepEditorFeedback.textContent = normalizedMessage;
  }

  function clearStepEditorFeedback() {
    setStepEditorFeedback('');
  }

  function updateEditorHeading(isEditing = false) {
    if (isElement(orchestrationEditorHeading)) {
      orchestrationEditorHeading.textContent = isEditing
        ? 'Edit custom orchestration'
        : 'New custom orchestration';
    }
    if (orchestrationSaveButton instanceof HTMLButtonElement) {
      orchestrationSaveButton.textContent = isEditing ? 'Save changes' : 'Save orchestration';
    }
    if (orchestrationResetButton instanceof HTMLButtonElement) {
      orchestrationResetButton.textContent = isEditing ? 'New orchestration' : 'Reset draft';
    }
  }

  function setCustomOrchestrationFeedback(message = '', variant = 'info') {
    if (!isElement(orchestrationImportFeedback)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    orchestrationImportFeedback.className = '';
    orchestrationImportFeedback.replaceChildren();
    if (!normalizedMessage) {
      orchestrationImportFeedback.classList.add('d-none');
      orchestrationImportFeedback.removeAttribute('role');
      return;
    }
    orchestrationImportFeedback.classList.remove('d-none');
    orchestrationImportFeedback.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    orchestrationImportFeedback.classList.add(
      'alert',
      variant === 'danger'
        ? 'alert-danger'
        : variant === 'success'
          ? 'alert-success'
          : 'alert-secondary',
      'py-2',
      'px-3',
      'mb-0'
    );
    orchestrationImportFeedback.textContent = normalizedMessage;
  }

  function clearCustomOrchestrationFeedback() {
    setCustomOrchestrationFeedback('');
  }

  function setDefinitionTextareaValue(definition) {
    if (orchestrationDefinitionInput instanceof HTMLTextAreaElement) {
      orchestrationDefinitionInput.value = formatOrchestrationDefinition(definition);
      orchestrationDefinitionInput.classList.remove('is-invalid');
      orchestrationDefinitionInput.removeAttribute('aria-invalid');
    }
  }

  function syncDefinitionTextareaFromDraft() {
    setDefinitionTextareaValue(currentDefinitionDraft);
    const validation = validateOrchestrationDefinitionForEditor(currentDefinitionDraft);
    setStructuredEditorLocked(false);
    if (validation.valid) {
      clearStepEditorFeedback();
    } else {
      setStepEditorFeedback(
        `${validation.message} Add or finish step fields before saving this orchestration.`,
        'warning'
      );
    }
  }

  function setEditorValues(record = null) {
    const normalizedRecord = record ? assertValidCustomOrchestration(record) : null;
    const isEditing = Boolean(normalizedRecord);
    if (orchestrationEditorIdInput instanceof HTMLInputElement) {
      orchestrationEditorIdInput.value = normalizedRecord?.id || '';
    }
    if (orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.value = normalizedRecord?.name || '';
    }
    if (orchestrationSlashCommandInput instanceof HTMLInputElement) {
      orchestrationSlashCommandInput.value = normalizedRecord?.slashCommandName || '';
    }
    if (
      orchestrationDescriptionInput instanceof HTMLTextAreaElement ||
      orchestrationDescriptionInput instanceof HTMLInputElement
    ) {
      orchestrationDescriptionInput.value = normalizedRecord?.description || '';
    }
    currentDefinitionDraft = cloneOrchestrationDefinition(
      normalizedRecord?.definition || buildCustomOrchestrationTemplate()
    );
    setDefinitionTextareaValue(currentDefinitionDraft);
    renderStructuredStepEditor();
    syncDefinitionTextareaFromDraft();
    updateEditorHeading(isEditing);
  }

  function captureAccordionUiState(container) {
    if (!isElement(container)) {
      return {
        expandedPanelIds: new Set(),
        focusedElementId: '',
        scrollTop: 0,
      };
    }
    const expandedPanelIds = new Set(
      Array.from(container.querySelectorAll('.accordion-collapse.show'))
        .map((panel) => (panel instanceof HTMLElement ? panel.id : ''))
        .filter(Boolean)
    );
    const activeElement =
      documentRef.activeElement instanceof HTMLElement && container.contains(documentRef.activeElement)
        ? documentRef.activeElement
        : null;
    return {
      expandedPanelIds,
      focusedElementId: activeElement?.id || '',
      scrollTop: container.scrollTop,
    };
  }

  function restoreAccordionUiState(container, { expandedPanelIds, focusedElementId, scrollTop }) {
    if (!isElement(container)) {
      return;
    }
    expandedPanelIds.forEach((panelId) => {
      const panel = documentRef.getElementById(panelId);
      if (!isElement(panel)) {
        return;
      }
      panel.classList.add('show');
      const headerButton = container.querySelector(`[data-bs-target="#${panelId}"]`);
      if (isElement(headerButton)) {
        headerButton.classList.remove('collapsed');
        headerButton.setAttribute('aria-expanded', 'true');
      }
    });
    container.scrollTop = typeof scrollTop === 'number' ? scrollTop : 0;
    if (focusedElementId) {
      const nextFocusTarget = documentRef.getElementById(focusedElementId);
      if (isElement(nextFocusTarget)) {
        nextFocusTarget.focus({ preventScroll: true });
      }
    }
  }

  function buildAccordionPanelId(prefix, id) {
    return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  }

  function appendMetadataEntry(list, label, value) {
    if (!isElement(list)) {
      return;
    }
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      return;
    }
    const term = documentRef.createElement('dt');
    term.textContent = label;
    list.appendChild(term);
    const description = documentRef.createElement('dd');
    description.textContent = normalizedValue;
    list.appendChild(description);
  }

  function renderDefinitionPreview(definition) {
    const preview = documentRef.createElement('pre');
    preview.className = 'orchestration-definition-preview mb-0';
    preview.textContent = formatOrchestrationDefinition(definition);
    return preview;
  }

  function renderFlowBlock(step, stepIndex, totalSteps) {
    const flow = buildOrchestrationStepFlow(step, stepIndex);
    const flowBlock = documentRef.createElement('div');
    flowBlock.className = 'orchestration-step-flow';

    const title = documentRef.createElement('p');
    title.className = 'orchestration-step-flow-title mb-1';
    title.textContent =
      stepIndex + 1 < totalSteps
        ? `Feeds step ${stepIndex + 2}`
        : 'Final output';
    flowBlock.appendChild(title);

    const description = documentRef.createElement('p');
    description.className = 'orchestration-step-flow-copy mb-2';
    description.textContent =
      stepIndex + 1 < totalSteps
        ? flow.producesCollection
          ? 'Later steps can use the latest item or the full collection from this step.'
          : 'Later steps can use this step output directly.'
        : 'The orchestration returns the final output from this step.';
    flowBlock.appendChild(description);

    const latestGroup = documentRef.createElement('div');
    latestGroup.className = 'orchestration-step-flow-group';
    const latestLabel = documentRef.createElement('span');
    latestLabel.className = 'orchestration-step-flow-label';
    latestLabel.textContent = 'Latest result';
    latestGroup.appendChild(latestLabel);
    const latestTokens = documentRef.createElement('div');
    latestTokens.className = 'orchestration-step-flow-tokens';
    flow.latestOutputTokens.forEach((token) => latestTokens.appendChild(createFlowToken(documentRef, token)));
    latestGroup.appendChild(latestTokens);
    flowBlock.appendChild(latestGroup);

    if (flow.namedOutputToken) {
      const namedGroup = documentRef.createElement('div');
      namedGroup.className = 'orchestration-step-flow-group';
      const namedLabel = documentRef.createElement('span');
      namedLabel.className = 'orchestration-step-flow-label';
      namedLabel.textContent = 'Named output';
      namedGroup.appendChild(namedLabel);
      const namedTokens = documentRef.createElement('div');
      namedTokens.className = 'orchestration-step-flow-tokens';
      namedTokens.appendChild(createFlowToken(documentRef, flow.namedOutputToken));
      namedGroup.appendChild(namedTokens);
      flowBlock.appendChild(namedGroup);
    }

    if (flow.collectionTokens.length) {
      const collectionGroup = documentRef.createElement('div');
      collectionGroup.className = 'orchestration-step-flow-group';
      const collectionLabel = documentRef.createElement('span');
      collectionLabel.className = 'orchestration-step-flow-label';
      collectionLabel.textContent = 'Collection output';
      collectionGroup.appendChild(collectionLabel);
      const collectionTokens = documentRef.createElement('div');
      collectionTokens.className = 'orchestration-step-flow-tokens';
      flow.collectionTokens.forEach((token) =>
        collectionTokens.appendChild(createFlowToken(documentRef, token))
      );
      collectionGroup.appendChild(collectionTokens);
      flowBlock.appendChild(collectionGroup);
    }

    return flowBlock;
  }

  function renderPromptStepFields(body, row, step, stepIndex) {
    const promptId = createControlId(stepIndex, 'prompt');
    appendField(body, documentRef, {
      label: 'Prompt',
      columnClass: 'col-12',
      control: createTextareaControl(documentRef, {
        id: promptId,
        stepIndex,
        fieldName: 'prompt',
        value: typeof step?.prompt === 'string' ? step.prompt : '',
        rows: 7,
        placeholder: 'Use {{userInput}} and prior step outputs here.',
      }),
    });

    appendField(row, documentRef, {
      label: 'Output key',
      columnClass: 'col-md-6',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'outputKey'),
        stepIndex,
        fieldName: 'outputKey',
        value: typeof step?.outputKey === 'string' ? step.outputKey : '',
        placeholder: 'critique',
      }),
      helpText: 'Optional named placeholder for later steps, like {{critique}}.',
    });

    appendField(row, documentRef, {
      label: 'Response instructions',
      columnClass: 'col-md-6',
      control: createTextareaControl(documentRef, {
        id: createControlId(stepIndex, 'responseFormatInstructions'),
        stepIndex,
        fieldName: 'responseFormat.instructions',
        value:
          typeof step?.responseFormat?.instructions === 'string'
            ? step.responseFormat.instructions
            : '',
        rows: 3,
        placeholder: 'Return plain text only.',
      }),
    });

    appendField(body, documentRef, {
      label: '',
      columnClass: 'col-12',
      control: createCheckboxField(documentRef, {
        id: createControlId(stepIndex, 'stripThinking'),
        stepIndex,
        fieldName: 'outputProcessing.stripThinking',
        checked: Boolean(step?.outputProcessing?.stripThinking),
        label: 'Strip model thinking from stored step output',
      }),
    });

    appendField(body, documentRef, {
      label: 'Step parameters JSON',
      columnClass: 'col-lg-6',
      control: createTextareaControl(documentRef, {
        id: createControlId(stepIndex, 'parameters'),
        stepIndex,
        fieldName: 'parameters',
        value: formatOptionalJsonObject(step?.parameters),
        rows: 5,
        json: true,
        placeholder: '{\n  "maxIssues": 6\n}',
      }),
      helpText: 'Optional JSON object saved with the step.',
    });

    appendField(body, documentRef, {
      label: 'Generation config JSON',
      columnClass: 'col-lg-6',
      control: createTextareaControl(documentRef, {
        id: createControlId(stepIndex, 'generationConfig'),
        stepIndex,
        fieldName: 'generationConfig',
        value: formatOptionalJsonObject(step?.generationConfig),
        rows: 5,
        json: true,
        placeholder: '{\n  "maxOutputTokens": 512\n}',
      }),
      helpText: 'Optional per-step overrides such as output-token caps or temperature.',
    });
  }

  function renderTransformStepFields(body, row, step, stepIndex) {
    appendField(row, documentRef, {
      label: 'Transform',
      columnClass: 'col-md-4',
      control: createSelectControl(documentRef, {
        id: createControlId(stepIndex, 'transform'),
        stepIndex,
        fieldName: 'transform',
        value:
          typeof step?.transform === 'string' && step.transform.trim()
            ? step.transform.trim()
            : 'chunkText',
        options: [{ value: 'chunkText', label: 'Chunk text' }],
      }),
    });

    appendField(row, documentRef, {
      label: 'Source path',
      columnClass: 'col-md-4',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'source'),
        stepIndex,
        fieldName: 'source',
        value: typeof step?.source === 'string' ? step.source : '',
        placeholder: 'documentPages',
      }),
    });

    appendField(row, documentRef, {
      label: 'Output key',
      columnClass: 'col-md-4',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'outputKey'),
        stepIndex,
        fieldName: 'outputKey',
        value: typeof step?.outputKey === 'string' ? step.outputKey : '',
        placeholder: 'documentChunks',
      }),
    });

    appendField(body, documentRef, {
      label: 'Transform parameters JSON',
      columnClass: 'col-12',
      control: createTextareaControl(documentRef, {
        id: createControlId(stepIndex, 'parameters'),
        stepIndex,
        fieldName: 'parameters',
        value: formatOptionalJsonObject(step?.parameters),
        rows: 8,
        json: true,
        placeholder:
          '{\n  "maxChars": 5000,\n  "overlapChars": 400,\n  "textField": "text",\n  "pageField": "pageNumber"\n}',
      }),
      helpText: 'For chunkText, configure chunk size, overlap, and source field names here.',
    });
  }

function renderForEachStepFields(body, row, step, stepIndex) {
    appendField(row, documentRef, {
      label: 'Input path',
      columnClass: 'col-md-4',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'input'),
        stepIndex,
        fieldName: 'input',
        value: typeof step?.input === 'string' ? step.input : '',
        placeholder: 'documentChunks',
      }),
    });

    appendField(row, documentRef, {
      label: 'Item name',
      columnClass: 'col-md-4',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'itemName'),
        stepIndex,
        fieldName: 'itemName',
        value: typeof step?.itemName === 'string' ? step.itemName : 'item',
        placeholder: 'chunk',
      }),
    });

    appendField(row, documentRef, {
      label: 'Output key',
      columnClass: 'col-md-4',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'outputKey'),
        stepIndex,
        fieldName: 'outputKey',
        value: typeof step?.outputKey === 'string' ? step.outputKey : '',
        placeholder: 'chunkMarkdown',
      }),
    });

  appendField(body, documentRef, {
    label: 'Prompt',
    columnClass: 'col-12',
    control: createTextareaControl(documentRef, {
      id: createControlId(stepIndex, 'prompt'),
      stepIndex,
      fieldName: 'prompt',
      value: typeof step?.prompt === 'string' ? step.prompt : '',
      rows: 7,
      placeholder: 'Use {{item}} and item-specific fields here.',
    }),
  });

  appendField(body, documentRef, {
    label: 'Response instructions',
    columnClass: 'col-md-6',
    control: createTextareaControl(documentRef, {
      id: createControlId(stepIndex, 'responseFormatInstructions'),
      stepIndex,
      fieldName: 'responseFormat.instructions',
      value:
        typeof step?.responseFormat?.instructions === 'string'
          ? step.responseFormat.instructions
          : '',
      rows: 3,
      placeholder: 'Return plain text only.',
    }),
  });

  appendField(body, documentRef, {
    label: '',
    columnClass: 'col-md-6',
    control: createCheckboxField(documentRef, {
      id: createControlId(stepIndex, 'stripThinking'),
      stepIndex,
      fieldName: 'outputProcessing.stripThinking',
      checked: Boolean(step?.outputProcessing?.stripThinking),
      label: 'Strip model thinking from stored step output',
    }),
  });

  appendField(body, documentRef, {
    label: 'Step parameters JSON',
    columnClass: 'col-lg-6',
    control: createTextareaControl(documentRef, {
      id: createControlId(stepIndex, 'parameters'),
      stepIndex,
      fieldName: 'parameters',
      value: formatOptionalJsonObject(step?.parameters),
      rows: 5,
      json: true,
      placeholder: '{\n  "preserveTone": true\n}',
    }),
  });

  appendField(body, documentRef, {
    label: 'Generation config JSON',
    columnClass: 'col-lg-6',
    control: createTextareaControl(documentRef, {
      id: createControlId(stepIndex, 'generationConfig'),
      stepIndex,
      fieldName: 'generationConfig',
      value: formatOptionalJsonObject(step?.generationConfig),
      rows: 5,
      json: true,
      placeholder: '{\n  "maxOutputTokens": 512\n}',
    }),
  });
}

  function renderJoinStepFields(body, row, step, stepIndex) {
    appendField(row, documentRef, {
      label: 'Source path',
      columnClass: 'col-md-6',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'source'),
        stepIndex,
        fieldName: 'source',
        value: typeof step?.source === 'string' ? step.source : '',
        placeholder: 'chunkMarkdown',
      }),
    });

    appendField(row, documentRef, {
      label: 'Output key',
      columnClass: 'col-md-6',
      control: createInputControl(documentRef, {
        id: createControlId(stepIndex, 'outputKey'),
        stepIndex,
        fieldName: 'outputKey',
        value: typeof step?.outputKey === 'string' ? step.outputKey : '',
        placeholder: 'combinedChunkMarkdown',
      }),
    });

    appendField(body, documentRef, {
      label: 'Separator',
      columnClass: 'col-12',
      control: createTextareaControl(documentRef, {
        id: createControlId(stepIndex, 'separator'),
        stepIndex,
        fieldName: 'separator',
        value: typeof step?.separator === 'string' ? step.separator : '\n\n',
        rows: 3,
        placeholder: '\\n\\n',
      }),
      helpText: 'Used when joining array outputs into one string.',
    });
  }

  function renderStructuredStepEditor() {
    if (!isElement(orchestrationStepList)) {
      return;
    }
    orchestrationStepList.replaceChildren();
    const steps = Array.isArray(currentDefinitionDraft?.steps) ? currentDefinitionDraft.steps : [];

    if (!steps.length) {
      const emptyState = documentRef.createElement('div');
      emptyState.className = 'alert alert-secondary py-2 px-3 mb-0';
      emptyState.setAttribute('role', 'status');
      emptyState.textContent = 'No steps yet. Add a step to define the orchestration flow.';
      orchestrationStepList.appendChild(emptyState);
      setStructuredEditorLocked(isStructuredEditorLocked);
      return;
    }

    steps.forEach((step, stepIndex) => {
      const stepType = normalizeOrchestrationStepType(step?.type);
      const item = documentRef.createElement('li');
      item.className = 'orchestration-step-item';

      const card = documentRef.createElement('section');
      card.className = 'card orchestration-step-card';
      card.setAttribute('aria-labelledby', createControlId(stepIndex, 'heading'));

      const header = documentRef.createElement('div');
      header.className = 'card-header d-flex flex-wrap align-items-start justify-content-between gap-3';

      const headerSummary = documentRef.createElement('div');
      headerSummary.className = 'd-flex flex-column gap-1';

      const meta = documentRef.createElement('div');
      meta.className = 'd-flex flex-wrap align-items-center gap-2';
      const positionBadge = documentRef.createElement('span');
      positionBadge.className = 'badge text-bg-secondary';
      positionBadge.textContent = `Step ${stepIndex + 1}`;
      meta.appendChild(positionBadge);
      const typeBadge = documentRef.createElement('span');
      typeBadge.className = 'badge orchestration-step-type-badge';
      typeBadge.textContent = buildStepTypeLabel(stepType);
      meta.appendChild(typeBadge);
      headerSummary.appendChild(meta);

      const heading = documentRef.createElement('h4');
      heading.className = 'h6 mb-0';
      heading.id = createControlId(stepIndex, 'heading');
      heading.textContent = buildStepDisplayName(step, stepIndex);
      headerSummary.appendChild(heading);
      header.appendChild(headerSummary);

      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove step';
      removeButton.dataset.orchestrationRemoveStep = 'true';
      removeButton.dataset.orchestrationStepIndex = String(stepIndex);
      header.appendChild(removeButton);

      card.appendChild(header);

      const body = documentRef.createElement('div');
      body.className = 'card-body d-flex flex-column gap-3';
      const row = documentRef.createElement('div');
      row.className = 'row g-3';

      appendField(row, documentRef, {
        label: 'Step name',
        columnClass: 'col-md-8',
        control: createInputControl(documentRef, {
          id: createControlId(stepIndex, 'stepName'),
          stepIndex,
          fieldName: 'stepName',
          value: buildStepDisplayName(step, stepIndex),
        }),
      });

      appendField(row, documentRef, {
        label: 'Step type',
        columnClass: 'col-md-4',
        control: createSelectControl(documentRef, {
          id: createControlId(stepIndex, 'type'),
          stepIndex,
          fieldName: 'type',
          value: stepType,
          options: [
            { value: 'prompt', label: 'Prompt' },
            { value: 'transform', label: 'Transform' },
            { value: 'forEach', label: 'For each' },
            { value: 'join', label: 'Join' },
          ],
        }),
      });

      body.appendChild(row);

      const detailGrid = documentRef.createElement('div');
      detailGrid.className = 'row g-3';

      if (stepType === 'transform') {
        renderTransformStepFields(detailGrid, detailGrid, step, stepIndex);
      } else if (stepType === 'forEach') {
        renderForEachStepFields(detailGrid, detailGrid, step, stepIndex);
      } else if (stepType === 'join') {
        renderJoinStepFields(detailGrid, detailGrid, step, stepIndex);
      } else {
        renderPromptStepFields(detailGrid, detailGrid, step, stepIndex);
      }

      body.appendChild(detailGrid);
      body.appendChild(renderFlowBlock(step, stepIndex, steps.length));
      card.appendChild(body);
      item.appendChild(card);
      orchestrationStepList.appendChild(item);
    });

    setStructuredEditorLocked(isStructuredEditorLocked);
  }

  function setStepFieldError(control, message = '') {
    if (!isFormField(control)) {
      return;
    }
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    control.setCustomValidity(normalizedMessage);
    control.classList.toggle('is-invalid', Boolean(normalizedMessage));
    if (normalizedMessage) {
      control.setAttribute('aria-invalid', 'true');
    } else {
      control.removeAttribute('aria-invalid');
    }
  }

  function updateStructuredEditorFromDefinitionText() {
    if (!(orchestrationDefinitionInput instanceof HTMLTextAreaElement)) {
      return;
    }

    let parsedDefinition;
    try {
      parsedDefinition = parseOrchestrationDefinitionText(orchestrationDefinitionInput.value);
    } catch (error) {
      setStructuredEditorLocked(true);
      setStepEditorFeedback(
        `${error instanceof Error ? error.message : String(error)} Fix the raw JSON to keep using the step editor.`,
        'danger'
      );
      orchestrationDefinitionInput.classList.add('is-invalid');
      orchestrationDefinitionInput.setAttribute('aria-invalid', 'true');
      return;
    }

    currentDefinitionDraft = cloneOrchestrationDefinition(parsedDefinition);
    if (!Array.isArray(currentDefinitionDraft.steps)) {
      currentDefinitionDraft.steps = [];
    }
    orchestrationDefinitionInput.classList.remove('is-invalid');
    orchestrationDefinitionInput.removeAttribute('aria-invalid');
    setStructuredEditorLocked(false);
    renderStructuredStepEditor();

    const validation = validateOrchestrationDefinitionForEditor(currentDefinitionDraft);
    if (validation.valid) {
      clearStepEditorFeedback();
    } else {
      setStepEditorFeedback(
        `${validation.message} Add or finish step fields before saving this orchestration.`,
        'warning'
      );
    }
  }

  function updateStepAtIndex(stepIndex, updater) {
    if (!Array.isArray(currentDefinitionDraft.steps)) {
      currentDefinitionDraft.steps = [];
    }
    const step = currentDefinitionDraft.steps[stepIndex];
    if (!isPlainObject(step) || typeof updater !== 'function') {
      return null;
    }
    const nextStep = updater(cloneOrchestrationDefinition(step));
    currentDefinitionDraft.steps.splice(stepIndex, 1, nextStep);
    return nextStep;
  }

  function updateStepBooleanField(stepIndex, fieldName, checked) {
    return updateStepAtIndex(stepIndex, (step) => {
      if (fieldName === 'outputProcessing.stripThinking') {
        const outputProcessing = isPlainObject(step.outputProcessing)
          ? { ...step.outputProcessing }
          : {};
        if (checked) {
          outputProcessing.stripThinking = true;
          step.outputProcessing = outputProcessing;
        } else {
          delete outputProcessing.stripThinking;
          step.outputProcessing = Object.keys(outputProcessing).length ? outputProcessing : undefined;
        }
      }
      return step;
    });
  }

  function updateStepJsonField(stepIndex, fieldName, rawValue) {
    return updateStepAtIndex(stepIndex, (step) => {
      if (fieldName === 'parameters') {
        step.parameters = parseOptionalJsonObjectText(rawValue, 'Step parameters');
      } else if (fieldName === 'generationConfig') {
        step.generationConfig = parseOptionalJsonObjectText(rawValue, 'Generation config');
      }
      return step;
    });
  }

  function updateStepStringField(stepIndex, fieldName, rawValue) {
    return updateStepAtIndex(stepIndex, (step) => {
      const value = fieldName === 'prompt' || fieldName === 'separator'
        ? replaceLineEndings(rawValue)
        : String(rawValue ?? '').trim();

      if (fieldName === 'type') {
        return buildOrchestrationStepForTypeChange(value, step, stepIndex + 1);
      }

      if (fieldName === 'responseFormat.instructions') {
        const responseFormat = isPlainObject(step.responseFormat) ? { ...step.responseFormat } : {};
        responseFormat.type =
          typeof responseFormat.type === 'string' && responseFormat.type.trim()
            ? responseFormat.type
            : 'plain_text';
        responseFormat.instructions = replaceLineEndings(rawValue);
        step.responseFormat = responseFormat;
        return step;
      }

      if (fieldName === 'stepName') {
        step.stepName = value || `Step ${stepIndex + 1}`;
        return step;
      }

      step[fieldName] = value;
      return step;
    });
  }

  function addStructuredStep(stepType = 'prompt') {
    if (isStructuredEditorLocked) {
      return null;
    }
    if (!Array.isArray(currentDefinitionDraft.steps)) {
      currentDefinitionDraft.steps = [];
    }
    const nextStep = buildOrchestrationStepTemplate(stepType, currentDefinitionDraft.steps.length + 1);
    currentDefinitionDraft.steps.push(nextStep);
    syncDefinitionTextareaFromDraft();
    renderStructuredStepEditor();
    return currentDefinitionDraft.steps.length - 1;
  }

  function removeStructuredStep(stepIndex) {
    if (isStructuredEditorLocked || !Array.isArray(currentDefinitionDraft.steps)) {
      return false;
    }
    if (stepIndex < 0 || stepIndex >= currentDefinitionDraft.steps.length) {
      return false;
    }
    currentDefinitionDraft.steps.splice(stepIndex, 1);
    syncDefinitionTextareaFromDraft();
    renderStructuredStepEditor();
    return true;
  }

  function renderCustomOrchestrations() {
    if (!isElement(customOrchestrationsList)) {
      return;
    }
    const uiState = captureAccordionUiState(customOrchestrationsList);
    const customOrchestrations = getCustomOrchestrations();
    customOrchestrationsList.replaceChildren();

    if (!customOrchestrations.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No custom orchestrations saved yet.';
      customOrchestrationsList.appendChild(emptyState);
      return;
    }

    customOrchestrations.forEach((record) => {
      const panelId = buildAccordionPanelId('customOrchestrationPanel', record.id);
      const headingId = buildAccordionPanelId('customOrchestrationHeading', record.id);

      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = headingId;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#${panelId}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', panelId);

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = record.name;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent =
        record.description || `${buildSlashCommandLabel(record.slashCommandName)} custom orchestration`;
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const controls = documentRef.createElement('div');
      controls.className = 'd-flex flex-wrap align-items-start justify-content-between gap-3';

      const commandSummary = documentRef.createElement('p');
      commandSummary.className = 'mb-0 text-body-secondary';
      commandSummary.innerHTML = `Slash command: <code>${buildSlashCommandLabel(
        record.slashCommandName
      )}</code>`;
      controls.appendChild(commandSummary);

      const actionGroup = documentRef.createElement('div');
      actionGroup.className = 'd-flex flex-wrap gap-2';

      const editButton = documentRef.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn-outline-primary btn-sm';
      editButton.textContent = 'Edit';
      editButton.dataset.customOrchestrationEdit = 'true';
      editButton.dataset.customOrchestrationId = record.id;
      actionGroup.appendChild(editButton);

      const exportButton = documentRef.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'btn btn-outline-secondary btn-sm';
      exportButton.textContent = 'Export JSON';
      exportButton.dataset.customOrchestrationExport = 'true';
      exportButton.dataset.customOrchestrationId = record.id;
      actionGroup.appendChild(exportButton);

      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-outline-danger btn-sm';
      removeButton.textContent = 'Remove';
      removeButton.dataset.customOrchestrationRemove = 'true';
      removeButton.dataset.customOrchestrationId = record.id;
      removeButton.dataset.customOrchestrationName = record.name;
      actionGroup.appendChild(removeButton);

      controls.appendChild(actionGroup);
      body.appendChild(controls);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Definition ID', record.definition?.id);
      appendMetadataEntry(metadata, 'Slash command', buildSlashCommandLabel(record.slashCommandName));
      appendMetadataEntry(metadata, 'Description', record.description);
      if (metadata.children.length) {
        body.appendChild(metadata);
      }

      const definitionGroup = documentRef.createElement('div');
      const definitionHeading = documentRef.createElement('p');
      definitionHeading.className = 'form-label mb-1';
      definitionHeading.textContent = 'Definition';
      definitionGroup.appendChild(definitionHeading);
      const definitionHelp = documentRef.createElement('p');
      definitionHelp.className = 'form-text mt-0 mb-2';
      definitionHelp.textContent =
        'Saved exactly as JSON. Use the editor to update it or export it.';
      definitionGroup.appendChild(definitionHelp);
      definitionGroup.appendChild(renderDefinitionPreview(record.definition));
      body.appendChild(definitionGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      customOrchestrationsList.appendChild(accordionItem);
    });

    restoreAccordionUiState(customOrchestrationsList, uiState);
  }

  function renderBuiltInOrchestrations() {
    if (!isElement(builtInOrchestrationsList)) {
      return;
    }
    const uiState = captureAccordionUiState(builtInOrchestrationsList);
    builtInOrchestrationsList.replaceChildren();

    if (!normalizedBuiltInOrchestrations.length) {
      const emptyState = documentRef.createElement('p');
      emptyState.className = 'text-body-secondary mb-0';
      emptyState.textContent = 'No app orchestrations are registered.';
      builtInOrchestrationsList.appendChild(emptyState);
      return;
    }

    normalizedBuiltInOrchestrations.forEach((record) => {
      const panelId = buildAccordionPanelId('builtInOrchestrationPanel', record.id);
      const headingId = buildAccordionPanelId('builtInOrchestrationHeading', record.id);

      const accordionItem = documentRef.createElement('div');
      accordionItem.className = 'accordion-item';

      const header = documentRef.createElement('h4');
      header.className = 'accordion-header';
      header.id = headingId;

      const headerButton = documentRef.createElement('button');
      headerButton.className = 'accordion-button collapsed';
      headerButton.type = 'button';
      headerButton.setAttribute('data-bs-toggle', 'collapse');
      headerButton.setAttribute('data-bs-target', `#${panelId}`);
      headerButton.setAttribute('aria-expanded', 'false');
      headerButton.setAttribute('aria-controls', panelId);

      const headerSummary = documentRef.createElement('span');
      headerSummary.className = 'mcp-server-summary';
      const headerTitle = documentRef.createElement('span');
      headerTitle.textContent = record.name;
      headerSummary.appendChild(headerTitle);
      const headerDescription = documentRef.createElement('small');
      headerDescription.textContent = record.description || record.usageLabel;
      headerSummary.appendChild(headerDescription);
      headerButton.appendChild(headerSummary);
      header.appendChild(headerButton);
      accordionItem.appendChild(header);

      const collapse = documentRef.createElement('div');
      collapse.id = panelId;
      collapse.className = 'accordion-collapse collapse';
      collapse.setAttribute('aria-labelledby', headingId);

      const body = documentRef.createElement('div');
      body.className = 'accordion-body d-flex flex-column gap-3';

      const note = documentRef.createElement('div');
      note.className = 'alert alert-secondary py-2 px-3 mb-0';
      note.setAttribute('role', 'note');
      note.textContent = `${record.usageLabel} These app-managed orchestrations are read-only.`;
      body.appendChild(note);

      const metadata = documentRef.createElement('dl');
      metadata.className = 'mcp-server-metadata mb-0';
      appendMetadataEntry(metadata, 'Definition ID', record.definition?.id);
      appendMetadataEntry(metadata, 'Usage', record.usageLabel);
      appendMetadataEntry(metadata, 'Description', record.description);
      body.appendChild(metadata);

      const definitionGroup = documentRef.createElement('div');
      const definitionHeading = documentRef.createElement('p');
      definitionHeading.className = 'form-label mb-1';
      definitionHeading.textContent = 'Definition';
      definitionGroup.appendChild(definitionHeading);
      definitionGroup.appendChild(renderDefinitionPreview(record.definition));
      body.appendChild(definitionGroup);

      collapse.appendChild(body);
      accordionItem.appendChild(collapse);
      builtInOrchestrationsList.appendChild(accordionItem);
    });

    restoreAccordionUiState(builtInOrchestrationsList, uiState);
  }

  function applyCustomOrchestrationsPreference(value) {
    appState.customOrchestrations = normalizeCustomOrchestrations(value);
    renderCustomOrchestrations();
  }

  function resetCustomOrchestrationEditor({ focus = false } = {}) {
    setEditorValues(null);
    clearCustomOrchestrationFeedback();
    if (focus && orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.focus();
    }
  }

  function loadCustomOrchestrationIntoEditor(orchestrationId, { focus = true } = {}) {
    const normalizedId =
      typeof orchestrationId === 'string' && orchestrationId.trim() ? orchestrationId.trim() : '';
    if (!normalizedId) {
      resetCustomOrchestrationEditor({ focus });
      return null;
    }
    const record = getCustomOrchestrations().find((entry) => entry.id === normalizedId) || null;
    if (!record) {
      throw new Error('The selected orchestration could not be found.');
    }
    setEditorValues(record);
    clearCustomOrchestrationFeedback();
    if (focus && orchestrationNameInput instanceof HTMLInputElement) {
      orchestrationNameInput.focus();
    }
    return record;
  }

  function getEditorDraftValues() {
    const editingId =
      orchestrationEditorIdInput instanceof HTMLInputElement
        ? orchestrationEditorIdInput.value.trim()
        : '';
    const name =
      orchestrationNameInput instanceof HTMLInputElement
        ? orchestrationNameInput.value.trim()
        : '';
    const slashCommandName =
      orchestrationSlashCommandInput instanceof HTMLInputElement
        ? normalizeSlashCommandName(orchestrationSlashCommandInput.value)
        : '';
    const description =
      orchestrationDescriptionInput instanceof HTMLTextAreaElement ||
      orchestrationDescriptionInput instanceof HTMLInputElement
        ? orchestrationDescriptionInput.value.trim()
        : '';
    const definitionText =
      orchestrationDefinitionInput instanceof HTMLTextAreaElement
        ? orchestrationDefinitionInput.value.trim()
        : '';

    if (!name) {
      throw new Error('Enter a name for the orchestration.');
    }
    if (!slashCommandName) {
      throw new Error('Enter a slash command using letters, numbers, or hyphens.');
    }
    if (!definitionText) {
      throw new Error('Enter a JSON definition for the orchestration.');
    }

    const definition = parseOrchestrationDefinitionText(definitionText);
    const existingRecords = getCustomOrchestrations();
    const duplicateCommandRecord = existingRecords.find(
      (record) => record.slashCommandName === slashCommandName && record.id !== editingId
    );
    if (duplicateCommandRecord) {
      throw new Error(
        `${buildSlashCommandLabel(slashCommandName)} is already used by ${duplicateCommandRecord.name}.`
      );
    }

    const existingRecord = existingRecords.find((record) => record.id === editingId) || null;
    return assertValidCustomOrchestration({
      id: editingId || undefined,
      name,
      slashCommandName,
      description,
      definition,
      importedAt: existingRecord?.importedAt,
      updatedAt: Date.now(),
    });
  }

  async function saveCustomOrchestrationDraft({ persist = true } = {}) {
    const draftRecord = getEditorDraftValues();
    let savedRecord = draftRecord;
    if (persist && typeof saveCustomOrchestration === 'function') {
      savedRecord = await saveCustomOrchestration(draftRecord);
      if (!savedRecord) {
        throw new Error('Custom orchestration storage is unavailable in this browser session.');
      }
    }
    const nextCustomOrchestrations = normalizeCustomOrchestrations([
      ...getCustomOrchestrations().filter((record) => record.id !== savedRecord.id),
      savedRecord,
    ]);
    applyCustomOrchestrationsPreference(nextCustomOrchestrations);
    setEditorValues(savedRecord);
    clearCustomOrchestrationFeedback();
    return savedRecord;
  }

  async function removeCustomOrchestrationPreference(orchestrationId, { persist = true } = {}) {
    const normalizedId =
      typeof orchestrationId === 'string' && orchestrationId.trim() ? orchestrationId.trim() : '';
    if (!normalizedId) {
      return false;
    }
    if (persist && typeof removeCustomOrchestration === 'function') {
      const removed = await removeCustomOrchestration(normalizedId);
      if (!removed) {
        throw new Error('The selected orchestration could not be removed.');
      }
    }
    applyCustomOrchestrationsPreference(
      getCustomOrchestrations().filter((record) => record.id !== normalizedId)
    );
    if (
      orchestrationEditorIdInput instanceof HTMLInputElement &&
      orchestrationEditorIdInput.value.trim() === normalizedId
    ) {
      resetCustomOrchestrationEditor();
    }
    clearCustomOrchestrationFeedback();
    return true;
  }

  async function readFileText(file) {
    if (!file || typeof file !== 'object') {
      throw new Error('Choose a JSON file before importing.');
    }
    if (typeof file.text === 'function') {
      return file.text();
    }
    if (typeof file.arrayBuffer === 'function') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (typeof globalThis.TextDecoder === 'function') {
        return new globalThis.TextDecoder('utf-8').decode(bytes);
      }
      return String.fromCharCode(...bytes);
    }
    throw new Error('The selected file could not be read.');
  }

  async function importCustomOrchestrationFile(file, { persist = true } = {}) {
    const importedRecords = parseCustomOrchestrationImportText(await readFileText(file));
    const existingRecords = getCustomOrchestrations();

    importedRecords.forEach((record) => {
      const duplicateRecord = existingRecords.find(
        (existingRecord) =>
          existingRecord.id === record.id ||
          existingRecord.slashCommandName === record.slashCommandName
      );
      if (duplicateRecord) {
        throw new Error(
          `${buildSlashCommandLabel(record.slashCommandName)} has already been added in this browser.`
        );
      }
    });

    let savedRecords = importedRecords;
    if (persist && typeof saveCustomOrchestration === 'function') {
      savedRecords = await Promise.all(
        importedRecords.map(async (record) => {
          const savedRecord = await saveCustomOrchestration(record);
          if (!savedRecord) {
            throw new Error('Custom orchestration storage is unavailable in this browser session.');
          }
          return savedRecord;
        })
      );
    }

    applyCustomOrchestrationsPreference([...existingRecords, ...savedRecords]);
    if (orchestrationImportInput instanceof HTMLInputElement) {
      orchestrationImportInput.value = '';
    }
    clearCustomOrchestrationFeedback();
    if (savedRecords.length === 1) {
      setEditorValues(savedRecords[0]);
    }
    return savedRecords;
  }

  function exportCustomOrchestration(orchestrationId) {
    const record = getCustomOrchestrations().find((entry) => entry.id === orchestrationId) || null;
    if (!record) {
      throw new Error('The selected orchestration could not be found.');
    }
    if (typeof downloadFile !== 'function') {
      throw new Error('File download is unavailable.');
    }
    const payload = buildCustomOrchestrationExportPayload(record);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadFile(blob, buildCustomOrchestrationExportFileName(record));
    return record;
  }

  function exportAllCustomOrchestrations() {
    const customOrchestrations = getCustomOrchestrations();
    if (!customOrchestrations.length) {
      throw new Error('No custom orchestrations to export.');
    }
    if (typeof downloadFile !== 'function') {
      throw new Error('File download is unavailable.');
    }
    const payload = buildCustomOrchestrationCollectionExportPayload(customOrchestrations);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadFile(blob, buildCustomOrchestrationCollectionExportFileName(new Date()));
    return customOrchestrations;
  }

  function bindStructuredEditorEvents() {
    if (orchestrationDefinitionInput instanceof HTMLTextAreaElement) {
      orchestrationDefinitionInput.addEventListener('input', () => {
        clearCustomOrchestrationFeedback();
        updateStructuredEditorFromDefinitionText();
      });
    }

    if (!isElement(orchestrationEditorForm) || orchestrationEditorForm.tagName !== 'FORM') {
      return;
    }

    orchestrationEditorForm.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const addButton = target.closest('button[data-orchestration-add-step]');
      if (addButton instanceof HTMLButtonElement) {
        const stepType = addButton.dataset.orchestrationAddStep || 'prompt';
        const stepIndex = addStructuredStep(stepType);
        clearCustomOrchestrationFeedback();
        if (Number.isInteger(stepIndex)) {
          const field = documentRef.getElementById(createControlId(stepIndex, 'stepName'));
          if (isElement(field)) {
            field.focus();
          }
        }
        return;
      }

      const removeButton = target.closest('button[data-orchestration-remove-step="true"]');
      if (!(removeButton instanceof HTMLButtonElement)) {
        return;
      }
      const stepIndex = Number.parseInt(removeButton.dataset.orchestrationStepIndex || '', 10);
      if (!Number.isInteger(stepIndex)) {
        return;
      }
      clearCustomOrchestrationFeedback();
      removeStructuredStep(stepIndex);
    });

    orchestrationEditorForm.addEventListener('change', (event) => {
      const target = isFormField(event.target) ? event.target : null;
      if (!isFormField(target) || isStructuredEditorLocked) {
        return;
      }
      const stepIndex = Number.parseInt(target.dataset.orchestrationStepIndex || '', 10);
      const fieldName = target.dataset.orchestrationStepField || '';
      if (!Number.isInteger(stepIndex) || !fieldName) {
        return;
      }

      setStepFieldError(target);
      clearCustomOrchestrationFeedback();

      try {
        if (target.dataset.orchestrationStepBoolean === 'true' && target instanceof HTMLInputElement) {
          updateStepBooleanField(stepIndex, fieldName, target.checked);
          syncDefinitionTextareaFromDraft();
          return;
        }

        if (target.dataset.orchestrationStepJson === 'true') {
          updateStepJsonField(stepIndex, fieldName, target.value);
        } else {
          updateStepStringField(stepIndex, fieldName, target.value);
        }

        const requiresRerender =
          fieldName === 'type' ||
          fieldName === 'stepName' ||
          fieldName === 'outputKey' ||
          fieldName === 'transform';

        syncDefinitionTextareaFromDraft();
        if (requiresRerender) {
          renderStructuredStepEditor();
          const replacement = documentRef.getElementById(target.id);
          if (isElement(replacement)) {
            replacement.focus();
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStepFieldError(target, message);
        setStepEditorFeedback(message, 'danger');
      }
    });
  }

  if (!Array.isArray(appState.customOrchestrations)) {
    appState.customOrchestrations = [];
  }

  setEditorValues(null);
  renderCustomOrchestrations();
  renderBuiltInOrchestrations();
  clearCustomOrchestrationFeedback();
  bindStructuredEditorEvents();

  return {
    applyCustomOrchestrationsPreference,
    clearCustomOrchestrationFeedback,
    exportAllCustomOrchestrations,
    exportCustomOrchestration,
    importCustomOrchestrationFile,
    loadCustomOrchestrationIntoEditor,
    removeCustomOrchestrationPreference,
    resetCustomOrchestrationEditor,
    saveCustomOrchestrationDraft,
    setCustomOrchestrationFeedback,
  };
}
