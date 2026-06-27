/**
 * Shared template helpers for widget code generation
 */

/** Parse block for extracting data from curl output */
export const PARSE_BLOCK = `
  let data = null;
  let error = null;
  try {
    const trimmed = (output || '').trim();
    if (!trimmed) {
      error = 'No response';
    } else if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
      error = 'Endpoint not available';
    } else if (trimmed.includes('"error"')) {
      try {
        const parsed = JSON.parse(trimmed);
        error = parsed.error || 'Load failed';
      } catch {
        error = 'Load failed';
      }
    } else {
      data = JSON.parse(trimmed);
    }
  } catch (e) {
    error = 'Parse error';
  }

  const containerStyle = {
    ...styles.card,
    position: 'absolute',
    top: widgetPosition.top + 'px',
    left: widgetPosition.left + 'px',
    pointerEvents: 'auto',
  };`

/** Wrapper opening tag for draggable container */
export const WRAP_OPEN = `
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="widget-container" style={containerStyle}>
        <div className="drag-handle" style={styles.dragHandle} onMouseDown={handleDragStart} title="Drag to move">
          <span style={styles.dragIndicator}>⋮⋮</span>
        </div>`

/** Wrapper closing tag */
export const WRAP_CLOSE = `
      </div>
    </div>
  );`

/** Issue report button template */
export const ISSUE_BUTTON = `
        <div style={{marginTop: '8px'}}><button style={styles.issueBtn} onClick={() => openIssue(error)}>Report Issue</button></div>`
