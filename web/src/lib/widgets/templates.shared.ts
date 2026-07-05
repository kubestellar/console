/**
 * Shared template constants and helpers used across all card templates
 */

// Standard parse block for all card renders
export const parseBlock = `
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

// Wrapper open tag for draggable container
export const wrapOpen = `
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div className="widget-container" style={containerStyle}>
        <div className="drag-handle" style={styles.dragHandle} onMouseDown={handleDragStart} title="Drag to move">
          <span style={styles.dragIndicator}>⋮⋮</span>
        </div>`

// Wrapper close tag
export const wrapClose = `
      </div>
    </div>
  );`

// Issue button snippet
export const issueButton = `
        <div style={{marginTop: '8px'}}><button style={styles.issueBtn} onClick={() => openIssue(error)}>Report Issue</button></div>`
