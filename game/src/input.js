// Keyboard and mouse: the stick is the arrow keys (or WASD), the
// throttle is Shift / Ctrl, and the mouse can steer by dragging.
// Every key the game uses is listed on the title screen.
export function makeInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0, // -1 nose down .. 1 nose up (stick pulled)
    roll: 0, // -1 left .. 1 right
    throttle: 0, // -1 down .. 1 up, applied while held
    mouseSteer: null, // {x, y} in -1..1 while dragging
    pressed: new Set(), // keys pressed since the last frame was read
  };

  const KEYMAP = {
    ArrowUp: 'pitch-down',
    KeyW: 'pitch-down',
    ArrowDown: 'pitch-up',
    KeyS: 'pitch-up',
    ArrowLeft: 'roll-left',
    KeyA: 'roll-left',
    ArrowRight: 'roll-right',
    KeyD: 'roll-right',
    ShiftLeft: 'throttle-up',
    ShiftRight: 'throttle-up',
    ControlLeft: 'throttle-down',
    ControlRight: 'throttle-down',
  };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  let dragging = false;
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    input.mouseSteer = pointerToSteer(event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (dragging) input.mouseSteer = pointerToSteer(event);
  });
  const endDrag = () => {
    dragging = false;
    input.mouseSteer = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function pointerToSteer(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
    };
  }

  // Read the current stick position. Mouse steering overrides keys.
  input.poll = function poll() {
    let pitch = 0;
    let roll = 0;
    let throttle = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch += 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttle -= 1;
    if (input.mouseSteer) {
      roll = input.mouseSteer.x;
      pitch = input.mouseSteer.y;
    }
    input.pitch = pitch;
    input.roll = roll;
    input.throttle = throttle;
  };

  // True once for a key pressed since the last call, then cleared.
  input.wasPressed = function wasPressed(code) {
    const hit = input.pressed.has(code);
    if (hit) input.pressed.delete(code);
    return hit;
  };

  input.clearPressed = function clearPressed() {
    input.pressed.clear();
  };

  return input;
}
