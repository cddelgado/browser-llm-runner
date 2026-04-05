import { isProcessingAttachments } from '../state/app-state.js';

/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   imageAttachmentInput?: HTMLInputElement | null;
 *   composerAttachmentTray?: HTMLElement | null;
 *   getAttachmentIconClass?: (attachment: any) => string;
 *   formatAttachmentSize?: (size: number) => string;
 *   setIconButtonContent?: (button: HTMLButtonElement, iconClass: string, label: string) => void;
 *   isProcessingComposerAttachments?: (state: any) => boolean;
 * }} options
 */
export function createComposerRuntimeController({
  appState,
  documentRef = document,
  imageAttachmentInput,
  composerAttachmentTray,
  getAttachmentIconClass = (_attachment) => 'bi-file-earmark',
  formatAttachmentSize = (_size) => '',
  setIconButtonContent = (_button, _iconClass, _label) => {},
  isProcessingComposerAttachments = isProcessingAttachments,
}) {
  function getPendingComposerAttachments() {
    return Array.isArray(appState.pendingComposerAttachments)
      ? appState.pendingComposerAttachments
      : [];
  }

  function clearPendingComposerAttachments({ resetInput = true } = {}) {
    appState.pendingComposerAttachments = [];
    if (resetInput && imageAttachmentInput instanceof HTMLInputElement) {
      imageAttachmentInput.value = '';
    }
    renderComposerAttachments();
  }

  function formatAttachmentDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '';
    }
    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    if (minutes > 0) {
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    return `${remainingSeconds}s`;
  }

  function renderComposerAttachments() {
    if (!(composerAttachmentTray instanceof HTMLElement)) {
      return;
    }
    const attachments = getPendingComposerAttachments();
    const attachmentsAreProcessing = isProcessingComposerAttachments(appState);
    composerAttachmentTray.replaceChildren();
    composerAttachmentTray.classList.toggle('d-none', attachments.length === 0);
    composerAttachmentTray.setAttribute('aria-busy', attachmentsAreProcessing ? 'true' : 'false');
    attachments.forEach((attachment, index) => {
      const item = documentRef.createElement('article');
      item.className = 'composer-attachment-card';
      item.dataset.attachmentId = attachment.id;
      if (attachment.type === 'image') {
        const image = documentRef.createElement('img');
        image.className = 'composer-attachment-thumb';
        image.src = attachment.url;
        image.alt = attachment.alt;
        item.appendChild(image);
      } else if (attachment.type === 'audio') {
        const audio = documentRef.createElement('audio');
        audio.className = 'composer-attachment-audio';
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = attachment.url;
        audio.setAttribute(
          'aria-label',
          attachment.filename
            ? `Attached audio preview: ${attachment.filename}`
            : 'Attached audio preview'
        );
        item.appendChild(audio);
      } else {
        const iconWrap = documentRef.createElement('div');
        iconWrap.className = 'composer-attachment-icon';
        const icon = documentRef.createElement('i');
        icon.className = `bi ${getAttachmentIconClass(attachment)}`;
        icon.setAttribute('aria-hidden', 'true');
        iconWrap.appendChild(icon);
        item.appendChild(iconWrap);
      }

      const meta = documentRef.createElement('div');
      meta.className = 'composer-attachment-meta';
      const name = documentRef.createElement('p');
      name.className = 'composer-attachment-name';
      name.textContent = attachment.filename;
      meta.appendChild(name);
      const size = documentRef.createElement('p');
      size.className = 'composer-attachment-detail';
      const metaBits = [];
      if (attachment.type === 'file') {
        metaBits.push(
          attachment.extension ? attachment.extension.toUpperCase() : attachment.mimeType || 'FILE'
        );
      } else if (attachment.type === 'audio') {
        if (typeof attachment.mimeType === 'string' && attachment.mimeType.trim()) {
          metaBits.push(attachment.mimeType.trim());
        }
        const durationLabel = formatAttachmentDuration(attachment.durationSeconds);
        if (durationLabel) {
          metaBits.push(durationLabel);
        }
      }
      const sizeLabel = formatAttachmentSize(attachment.size);
      if (sizeLabel) {
        metaBits.push(sizeLabel);
      }
      size.textContent = metaBits.join(' · ');
      meta.appendChild(size);
      item.appendChild(meta);

      const removeButton = documentRef.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-sm btn-light composer-attachment-remove';
      removeButton.setAttribute('aria-label', `Remove ${attachment.filename}`);
      removeButton.dataset.attachmentIndex = String(index);
      removeButton.disabled = attachmentsAreProcessing;
      setIconButtonContent(removeButton, 'bi-x-lg', `Remove ${attachment.filename}`);
      item.appendChild(removeButton);
      composerAttachmentTray.appendChild(item);
    });
  }

  function buildUserMessageAttachmentPayload(attachments) {
    const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
    const contentParts = normalizedAttachments.map((attachment) => ({
      ...(attachment.type === 'image'
        ? {
            type: 'image',
            artifactId: attachment.id,
            mimeType: attachment.mimeType,
            base64: attachment.data,
            url: attachment.url,
            filename: attachment.filename,
            width: attachment.width,
            height: attachment.height,
            alt: attachment.alt,
            workspacePath: attachment.workspacePath,
          }
        : attachment.type === 'audio'
          ? {
              type: 'audio',
              artifactId: attachment.id,
              mimeType: attachment.mimeType,
              base64: attachment.data,
              url: attachment.url,
              filename: attachment.filename,
              size: attachment.size,
              durationSeconds: attachment.durationSeconds,
              sampleRate: attachment.sampleRate,
              sampleCount: attachment.sampleCount,
              samplesBase64: attachment.samplesBase64,
              workspacePath: attachment.workspacePath,
            }
          : {
              type: 'file',
              artifactId: attachment.id,
              mimeType: attachment.mimeType,
              filename: attachment.filename,
              extension: attachment.extension,
              size: attachment.size,
              text: attachment.data,
              normalizedText: attachment.normalizedText,
              normalizedFormat: attachment.normalizedFormat,
              pageCount: attachment.pageCount,
              conversionWarnings: Array.isArray(attachment.conversionWarnings)
                ? attachment.conversionWarnings
                : [],
              memoryHint:
                attachment.memoryHint && typeof attachment.memoryHint === 'object'
                  ? attachment.memoryHint
                  : undefined,
              llmText: attachment.llmText,
              workspacePath: attachment.workspacePath,
            }),
    }));
    const artifactRefs = normalizedAttachments.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      workspacePath: attachment.workspacePath,
      hash: attachment.hash,
    }));
    return { contentParts, artifactRefs };
  }

  function getMessageArtifacts(message, conversationId) {
    const refs = Array.isArray(message?.artifactRefs) ? message.artifactRefs : [];
    const attachmentParts = Array.isArray(message?.content?.parts)
      ? message.content.parts.filter(
          (part) => part?.type === 'image' || part?.type === 'audio' || part?.type === 'file'
        )
      : [];
    return attachmentParts
      .map((part) => {
        const ref = refs.find((candidate) => candidate?.id === part.artifactId) || null;
        const artifactId =
          typeof part.artifactId === 'string' && part.artifactId.trim() ? part.artifactId.trim() : '';
        const mimeType =
          typeof part.mimeType === 'string' && part.mimeType.trim()
            ? part.mimeType.trim()
            : typeof ref?.mimeType === 'string'
              ? ref.mimeType
              : '';
        if (!artifactId || !mimeType) {
          return null;
        }
        if (part.type === 'file') {
          const data = typeof part.text === 'string' ? part.text : '';
          if (!data) {
            return null;
          }
          return {
            id: artifactId,
            conversationId,
            messageId: message.id,
            kind: 'text',
            mimeType,
            encoding: 'utf-8',
            data,
            hash:
              ref?.hash && typeof ref.hash === 'object'
                ? {
                    algorithm: ref.hash.algorithm,
                    value: ref.hash.value,
                  }
                : undefined,
            filename:
              typeof part.filename === 'string' && part.filename.trim()
                ? part.filename.trim()
                : typeof ref?.filename === 'string' && ref.filename.trim()
                  ? ref.filename.trim()
                  : null,
            workspacePath:
              typeof part.workspacePath === 'string' && part.workspacePath.trim()
                ? part.workspacePath.trim()
                : typeof ref?.workspacePath === 'string' && ref.workspacePath.trim()
                  ? ref.workspacePath.trim()
                  : null,
          };
        }
        const data = typeof part.base64 === 'string' && part.base64.trim() ? part.base64.trim() : '';
        if (!data) {
          return null;
        }
        return {
          id: artifactId,
          conversationId,
          messageId: message.id,
          kind: 'binary',
          mimeType,
          encoding: 'base64',
          data,
          hash:
            ref?.hash && typeof ref.hash === 'object'
              ? {
                  algorithm: ref.hash.algorithm,
                  value: ref.hash.value,
                }
              : undefined,
          filename:
            typeof part.filename === 'string' && part.filename.trim()
              ? part.filename.trim()
              : typeof ref?.filename === 'string' && ref.filename.trim()
                ? ref.filename.trim()
                : null,
          workspacePath:
            typeof part.workspacePath === 'string' && part.workspacePath.trim()
              ? part.workspacePath.trim()
              : typeof ref?.workspacePath === 'string' && ref.workspacePath.trim()
                ? ref.workspacePath.trim()
                : null,
        };
      })
      .filter(Boolean);
  }

  function filterPendingComposerAttachmentsForModel(attachments, mediaSupport) {
    const nextAttachments = [];
    const removedUnsupported = [];
    const removedLimited = [];
    let imageCount = 0;
    let audioCount = 0;
    let videoCount = 0;

    (Array.isArray(attachments) ? attachments : []).forEach((attachment) => {
      if (!attachment || typeof attachment !== 'object') {
        return;
      }
      if (attachment.type === 'image') {
        if (!mediaSupport.imageInputSupported) {
          removedUnsupported.push(attachment);
          return;
        }
        if (mediaSupport.maxImageInputs && imageCount >= mediaSupport.maxImageInputs) {
          removedLimited.push(attachment);
          return;
        }
        imageCount += 1;
        nextAttachments.push(attachment);
        return;
      }
      if (attachment.type === 'audio') {
        if (!mediaSupport.audioInputSupported) {
          removedUnsupported.push(attachment);
          return;
        }
        if (mediaSupport.maxAudioInputs && audioCount >= mediaSupport.maxAudioInputs) {
          removedLimited.push(attachment);
          return;
        }
        audioCount += 1;
        nextAttachments.push(attachment);
        return;
      }
      if (attachment.type === 'video') {
        if (!mediaSupport.videoInputSupported) {
          removedUnsupported.push(attachment);
          return;
        }
        if (mediaSupport.maxVideoInputs && videoCount >= mediaSupport.maxVideoInputs) {
          removedLimited.push(attachment);
          return;
        }
        videoCount += 1;
        nextAttachments.push(attachment);
        return;
      }
      nextAttachments.push(attachment);
    });

    return {
      attachments: nextAttachments,
      removedUnsupported,
      removedLimited,
    };
  }

  function getAttachmentTypeLabel(type) {
    if (type === 'image') {
      return 'image';
    }
    if (type === 'audio') {
      return 'audio';
    }
    if (type === 'video') {
      return 'video';
    }
    return 'attachment';
  }

  function formatAttachmentTypeList(types) {
    const normalizedTypes = [...new Set(types.filter(Boolean))];
    if (!normalizedTypes.length) {
      return 'attachments';
    }
    if (normalizedTypes.length === 1) {
      return `${normalizedTypes[0]} attachments`;
    }
    if (normalizedTypes.length === 2) {
      return `${normalizedTypes[0]} and ${normalizedTypes[1]} attachments`;
    }
    return `${normalizedTypes.slice(0, -1).join(', ')}, and ${normalizedTypes.at(-1)} attachments`;
  }

  function buildRemovedComposerAttachmentStatus({
    removedUnsupported,
    removedLimited,
    mediaSupport,
  }) {
    const messages = [];
    if (removedUnsupported.length) {
      const unsupportedTypes = removedUnsupported.map((attachment) =>
        getAttachmentTypeLabel(attachment?.type)
      );
      messages.push(
        `${
          removedUnsupported.length === 1
            ? `${getAttachmentTypeLabel(removedUnsupported[0]?.type)} attachment was`
            : `${formatAttachmentTypeList(unsupportedTypes)} were`
        } removed because the selected model does not support ${
          removedUnsupported.length === 1 ? 'it' : 'them'
        }.`
      );
    }
    const limitedTypes = [
      ...new Set(removedLimited.map((attachment) => getAttachmentTypeLabel(attachment?.type))),
    ];
    limitedTypes.forEach((type) => {
      const limit =
        type === 'image'
          ? mediaSupport.maxImageInputs
          : type === 'audio'
            ? mediaSupport.maxAudioInputs
            : mediaSupport.maxVideoInputs;
      if (!limit) {
        return;
      }
      messages.push(
        `Extra ${type} attachments were removed because the selected model only accepts ${limit} ${type} attachment${
          limit === 1 ? '' : 's'
        }.`
      );
    });
    return messages.join(' ');
  }

  return {
    buildRemovedComposerAttachmentStatus,
    buildUserMessageAttachmentPayload,
    clearPendingComposerAttachments,
    filterPendingComposerAttachmentsForModel,
    getMessageArtifacts,
    getPendingComposerAttachments,
    renderComposerAttachments,
  };
}
