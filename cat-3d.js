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
    render(player, board, now, moving) {
      const x = board.originX + (player.x - player.y) * board.tileWidth / 2;
      const ground = board.originY + (player.x + player.y) * board.tileHeight / 2;
      const size = board.tileWidth * 0.5;
      const stride = moving ? Math.sin(now / 90) : 0;
      const bob = Math.abs(stride) * size * 0.035;
      const facing = (player.facingX - player.facingY < 0 ? -1 : 1) * 0.24;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      draw(sphere, matrix(x, ground, -20, size * 0.43, size * 0.1, size * 0.34), charcoal, 0.38);
      draw(sphere, matrix(x - size * 0.34, ground - size * 0.66 + bob, 0, size * 0.12, size * 0.42, size * 0.12, facing, 0.45), darkOrange);
      draw(sphere, matrix(x, ground - size * 0.6 + bob, 0, size * 0.34, size * 0.43, size * 0.27, facing), orange);
      draw(sphere, matrix(x, ground - size * 0.6 + bob, 12, size * 0.2, size * 0.27, size * 0.08, facing), cream);

      for (const pair of [-1, 1]) {
        for (const side of [-1, 1]) {
          const legStride = side * pair * stride;
          const legX = x + side * size * (0.16 + pair * 0.035);
          const legGround = ground - size * (0.19 + pair * 0.07);
          draw(sphere, matrix(legX + legStride * size * 0.07, legGround + bob,
            pair * 9 + 9, size * 0.085, size * 0.27, size * 0.09,
            facing, legStride * 0.5), orange);
          draw(sphere, matrix(legX + legStride * size * 0.15,
            ground - size * (0.015 + pair * 0.025),
            pair * 9 + 17, size * 0.115, size * 0.075, size * 0.12, facing), cream);
        }
      }

      draw(sphere, matrix(x, ground - size * 1.18 + bob, 4, size * 0.34, size * 0.31, size * 0.3, facing), orange);
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
    },
  };
}
