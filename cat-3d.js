const canvas = document.querySelector("#cat-layer");
const gl = canvas.getContext("webgl", { alpha: true, antialias: true });

if (gl) {
  const vertexShader = `
    attribute vec3 position;
    attribute vec3 normal;
    uniform mat4 model;
    uniform vec2 resolution;
    varying vec3 surfaceNormal;
    void main() {
      vec4 world = model * vec4(position, 1.0);
      gl_Position = vec4(world.x / resolution.x * 2.0 - 1.0,
        1.0 - world.y / resolution.y * 2.0, -world.z / 1000.0, 1.0);
      surfaceNormal = normalize(mat3(model) * normal);
    }
  `;
  const fragmentShader = `
    precision mediump float;
    uniform vec3 color;
    uniform float opacity;
    varying vec3 surfaceNormal;
    void main() {
      vec3 light = normalize(vec3(-0.4, -0.7, 1.0));
      float shade = 0.64 + max(dot(normalize(surfaceNormal), light), 0.0) * 0.42;
      gl_FragColor = vec4(color * shade, opacity);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  gl.useProgram(program);

  const locations = {
    position: gl.getAttribLocation(program, "position"),
    normal: gl.getAttribLocation(program, "normal"),
    model: gl.getUniformLocation(program, "model"),
    resolution: gl.getUniformLocation(program, "resolution"),
    color: gl.getUniformLocation(program, "color"),
    opacity: gl.getUniformLocation(program, "opacity"),
  };

  function makeSphere(rows = 12, columns = 18) {
    const vertices = [];
    const indices = [];
    for (let row = 0; row <= rows; row += 1) {
      const vertical = row / rows * Math.PI;
      for (let column = 0; column <= columns; column += 1) {
        const horizontal = column / columns * Math.PI * 2;
        vertices.push(
          Math.sin(vertical) * Math.cos(horizontal),
          Math.cos(vertical),
          Math.sin(vertical) * Math.sin(horizontal),
        );
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const first = row * (columns + 1) + column;
        const second = first + columns + 1;
        indices.push(first, second, first + 1, second, second + 1, first + 1);
      }
    }
    return { vertices, indices };
  }

  function makeCone(segments = 16) {
    const vertices = [0, -1, 0, 0, 1, 0];
    const indices = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      vertices.push(Math.cos(angle), 1, Math.sin(angle));
    }
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      indices.push(0, index + 2, next + 2, 1, next + 2, index + 2);
    }
    return { vertices, indices };
  }

  function upload(shape) {
    const normals = [];
    for (let index = 0; index < shape.vertices.length; index += 3) {
      const x = shape.vertices[index];
      const y = shape.vertices[index + 1];
      const z = shape.vertices[index + 2];
      const length = Math.hypot(x, y, z) || 1;
      normals.push(x / length, y / length, z / length);
    }
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shape.vertices), gl.STATIC_DRAW);
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(shape.indices), gl.STATIC_DRAW);
    return { vertexBuffer, normalBuffer, indexBuffer, count: shape.indices.length };
  }

  const sphere = upload(makeSphere());
  const cone = upload(makeCone());
  const orange = [0.949, 0.545, 0.259];
  const darkOrange = [0.722, 0.322, 0.184];
  const cream = [1, 0.957, 0.847];
  const charcoal = [0.153, 0.125, 0.22];
  const pink = [0.875, 0.325, 0.427];
  const mouseGray = [0.52, 0.56, 0.66];
  const mouseLight = [0.82, 0.84, 0.88];

  function matrix(x, y, z, sx, sy, sz, turn = 0, tilt = 0) {
    const cosine = Math.cos(turn);
    const sine = Math.sin(turn);
    const leanCosine = Math.cos(tilt);
    const leanSine = Math.sin(tilt);
    return new Float32Array([
      cosine * sx, leanSine * sine * sx, -leanCosine * sine * sx, 0,
      0, leanCosine * sy, leanSine * sy, 0,
      sine * sz, -leanSine * cosine * sz, leanCosine * cosine * sz, 0,
      x, y, z, 1,
    ]);
  }

  function draw(shape, transform, color, opacity = 1) {
    gl.bindBuffer(gl.ARRAY_BUFFER, shape.vertexBuffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, shape.normalBuffer);
    gl.enableVertexAttribArray(locations.normal);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.indexBuffer);
    gl.uniformMatrix4fv(locations.model, false, transform);
    gl.uniform3fv(locations.color, color);
    gl.uniform1f(locations.opacity, opacity);
    gl.drawElements(gl.TRIANGLES, shape.count, gl.UNSIGNED_SHORT, 0);
  }

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(locations.resolution, innerWidth, innerHeight);
  }
  window.addEventListener("resize", resize);
  resize();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);

  window.cat3D = {
    render(player, mouse, board, now, moving, dashing) {
      const x = board.originX + (player.x - player.y) * board.tileWidth / 2;
      const ground = board.originY + (player.x + player.y) * board.tileHeight / 2;
      const size = board.tileWidth * 0.5;
      const stride = moving ? Math.sin(now / (dashing ? 58 : 86)) : 0;
      const bob = Math.abs(stride) * size * (dashing ? 0.07 : 0.045);
      const facing = (player.facingX - player.facingY < 0 ? -1 : 1) * 0.24;
      const lean = moving ? (dashing ? 0.22 : 0.08) : Math.sin(now / 700) * 0.018;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      draw(sphere, matrix(x, ground, -20, size * 0.43, size * 0.1, size * 0.34), charcoal, 0.38);
      const tailSwing = Math.sin(now / (moving ? 105 : 310)) * (moving ? 0.55 : 0.28);
      for (let segment = 0; segment < 3; segment += 1) {
        draw(sphere, matrix(
          x - size * (0.31 + segment * 0.13) + tailSwing * size * segment * 0.035,
          ground - size * (0.61 + segment * 0.13) + bob,
          -segment * 2,
          size * (0.12 - segment * 0.015),
          size * 0.24,
          size * (0.12 - segment * 0.015),
          facing,
          0.65 + tailSwing * 0.22,
        ), segment === 1 ? orange : darkOrange);
      }
      draw(sphere, matrix(x, ground - size * 0.6 + bob, 0,
        size * (dashing ? 0.39 : 0.34), size * (dashing ? 0.38 : 0.43),
        size * 0.27, facing, lean), orange);
      draw(sphere, matrix(x, ground - size * 0.6 + bob, 12, size * 0.2, size * 0.27, size * 0.08, facing), cream);

      for (const pair of [-1, 1]) {
        for (const side of [-1, 1]) {
          const legStride = side * pair * stride;
          const legX = x + side * size * (0.16 + pair * 0.035);
          const legGround = ground - size * (0.19 + pair * 0.07);
          draw(sphere, matrix(legX + legStride * size * 0.13, legGround + bob,
            pair * 9 + 9, size * 0.09, size * 0.28, size * 0.095,
            facing, legStride * (dashing ? 0.95 : 0.72)), orange);
          draw(sphere, matrix(legX + legStride * size * 0.25,
            ground - size * (0.015 + pair * 0.025) - Math.max(0, legStride) * size * 0.08,
            pair * 9 + 17, size * 0.115, size * 0.075, size * 0.12, facing), cream);
        }
      }

      draw(sphere, matrix(x + lean * size * 0.25, ground - size * 1.18 + bob,
        4, size * 0.34, size * 0.31, size * 0.3, facing, lean * 0.5), orange);
      for (const side of [-1, 1]) {
        draw(cone, matrix(x + side * size * 0.22, ground - size * 1.48 + bob,
          1, size * 0.16, size * 0.24, size * 0.15, facing, side * -0.16), orange);
        draw(sphere, matrix(x + side * size * 0.09, ground - size * 1.1 + bob,
          22, size * 0.13, size * 0.1, size * 0.07, facing), cream);
        draw(sphere, matrix(x + side * size * 0.12, ground - size * 1.25 + bob,
          27, size * 0.036, size * 0.05, size * 0.028, facing), charcoal);
      }
      draw(cone, matrix(x, ground - size * 1.11 + bob, 29,
        size * 0.055, size * 0.055, size * 0.04, facing, Math.PI / 2), pink);

      if (!mouse) return;
      const mouseX = board.originX + (mouse.x - mouse.y) * board.tileWidth / 2;
      const mouseGround = board.originY + (mouse.x + mouse.y) * board.tileHeight / 2;
      const mouseSize = size * 0.58;
      const fleeing = mouse.state === "fleeing";
      const scurry = fleeing ? Math.sin(now / 58) : 0;
      const mouseBob = Math.abs(scurry) * mouseSize * 0.08;
      const mouseFacing = ((mouse.facingX || -1) - (mouse.facingY || 0) < 0 ? -1 : 1) * 0.3;

      draw(sphere, matrix(mouseX, mouseGround, -18,
        mouseSize * 0.44, mouseSize * 0.08, mouseSize * 0.3), charcoal, 0.28);
      for (let segment = 0; segment < 4; segment += 1) {
        draw(sphere, matrix(
          mouseX - mouseSize * (0.35 + segment * 0.2),
          mouseGround - mouseSize * (0.35 + segment * 0.04) +
            Math.sin(now / 120 + segment) * mouseSize * 0.07,
          -segment,
          mouseSize * 0.1,
          mouseSize * 0.2,
          mouseSize * 0.08,
          mouseFacing,
          0.8,
        ), pink);
      }
      draw(sphere, matrix(mouseX, mouseGround - mouseSize * 0.4 + mouseBob,
        3, mouseSize * 0.4, mouseSize * 0.35, mouseSize * 0.31, mouseFacing), mouseGray);
      draw(sphere, matrix(mouseX + mouseSize * 0.16, mouseGround - mouseSize * 0.76 + mouseBob,
        9, mouseSize * 0.3, mouseSize * 0.27, mouseSize * 0.25, mouseFacing), mouseGray);
      for (const side of [-1, 1]) {
        draw(sphere, matrix(mouseX + side * mouseSize * 0.22,
          mouseGround - mouseSize * 0.96 + mouseBob, 7,
          mouseSize * 0.16, mouseSize * 0.19, mouseSize * 0.08,
          mouseFacing, side * 0.18), pink);
        draw(sphere, matrix(mouseX + side * mouseSize * 0.1,
          mouseGround - mouseSize * 0.78 + mouseBob, 28,
          mouseSize * 0.035, mouseSize * 0.045, mouseSize * 0.025,
          mouseFacing), charcoal);
        const pawSwing = side * scurry * mouseSize * 0.17;
        draw(sphere, matrix(mouseX + side * mouseSize * 0.2 + pawSwing,
          mouseGround - mouseSize * 0.08, 15,
          mouseSize * 0.12, mouseSize * 0.06, mouseSize * 0.1,
          mouseFacing), mouseLight);
      }
      draw(sphere, matrix(mouseX + mouseSize * 0.2, mouseGround - mouseSize * 0.67 + mouseBob,
        31, mouseSize * 0.07, mouseSize * 0.055, mouseSize * 0.045,
        mouseFacing), pink);
    },
  };
}
