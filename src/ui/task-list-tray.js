function getVisualTaskListItems(items = []) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const pendingItems = normalizedItems.filter((item) => item?.status !== 1);
  const completedItems = normalizedItems.filter((item) => item?.status === 1);
  return [...pendingItems, ...completedItems];
}

function createTaskListStatusIcon(documentRef, item) {
  const icon = documentRef.createElement('i');
  const isComplete = item?.status === 1;
  icon.className = `bi ${isComplete ? 'bi-check-circle-fill' : 'bi-circle'} task-list-item-icon`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createTaskListRow(documentRef, item) {
  const listItem = documentRef.createElement('li');
  listItem.className = 'task-list-item';
  listItem.dataset.taskStatus = item?.status === 1 ? 'done' : 'pending';

  const iconWrap = documentRef.createElement('span');
  iconWrap.className = 'task-list-item-icon-wrap';
  iconWrap.appendChild(createTaskListStatusIcon(documentRef, item));

  const text = documentRef.createElement('span');
  text.className = 'task-list-item-text';
  text.textContent = typeof item?.text === 'string' ? item.text : '';

  const status = documentRef.createElement('span');
  status.className = 'visually-hidden';
  status.textContent = item?.status === 1 ? 'Complete' : 'Pending';

  listItem.append(iconWrap, text, status);
  return listItem;
}

export function renderTaskListTray({
  container,
  items = [],
  isExpanded = false,
  onToggle = () => {},
} = {}) {
  if (!container || container.nodeType !== 1) {
    return;
  }
  const documentRef = container.ownerDocument || document;
  const normalizedItems = Array.isArray(items) ? items : [];
  const hasItems = normalizedItems.length > 0;

  container.replaceChildren();
  container.dataset.hasItems = hasItems ? 'true' : 'false';
  container.classList.toggle('d-none', !hasItems);
  container.classList.toggle('is-expanded', Boolean(isExpanded && hasItems));

  if (!hasItems) {
    return;
  }

  const surface = documentRef.createElement('section');
  surface.className = 'task-list-tray-surface';
  surface.setAttribute('aria-label', 'Task list');

  const header = documentRef.createElement('div');
  header.className = 'task-list-tray-header';

  const title = documentRef.createElement('p');
  title.className = 'task-list-tray-title';
  title.textContent = 'Task list';

  const summary = documentRef.createElement('p');
  summary.className = 'task-list-tray-summary';
  const completeCount = normalizedItems.filter((item) => item?.status === 1).length;
  const pendingCount = normalizedItems.length - completeCount;
  summary.textContent = `${pendingCount} pending, ${completeCount} complete`;

  const toggleButton = documentRef.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'btn task-list-tray-toggle';
  toggleButton.setAttribute('aria-expanded', String(Boolean(isExpanded)));
  toggleButton.setAttribute('aria-label', isExpanded ? 'Collapse task list' : 'Expand task list');
  toggleButton.setAttribute('title', isExpanded ? 'Collapse task list' : 'Expand task list');
  const toggleIcon = documentRef.createElement('i');
  toggleIcon.className = `bi ${isExpanded ? 'bi-dash-lg' : 'bi-list-check'}`;
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleButton.appendChild(toggleIcon);
  toggleButton.addEventListener('click', () => onToggle());

  header.append(title, summary, toggleButton);
  surface.appendChild(header);

  const list = documentRef.createElement('ol');
  list.className = 'task-list-items';
  const visibleItems = isExpanded ? getVisualTaskListItems(normalizedItems) : getVisualTaskListItems(normalizedItems).slice(0, 2);
  visibleItems.forEach((item) => {
    list.appendChild(createTaskListRow(documentRef, item));
  });
  surface.appendChild(list);

  if (!isExpanded && normalizedItems.length > visibleItems.length) {
    const overflow = documentRef.createElement('p');
    overflow.className = 'task-list-tray-overflow';
    overflow.textContent = `+${normalizedItems.length - visibleItems.length} more`;
    surface.appendChild(overflow);
  }

  container.appendChild(surface);
}
