let total = 0;

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('listaCargos')) {
    const datalist = document.createElement('datalist');
    datalist.id = 'listaCargos';

    datalist.innerHTML = `
      <option value="Supervisor">
      <option value="Operador Eléctrico">
      <option value="Operador de Maquinaria">
      <option value="Topógrafo">
      <option value="Mecánico">
      <option value="Ayudante">
      <option value="Ingeniero">
      <option value="Técnico">
    `;

    document.body.appendChild(datalist);
  }

  document.getElementById('sistema').style.display = 'none';

  const usuario = localStorage.getItem('usuario');
  const rol = localStorage.getItem('rol');
  const token = localStorage.getItem('token');

  if (usuario && rol && token) {
    iniciarSistema(usuario, rol);
  }
});

document.getElementById('formLogin').addEventListener('submit', e => {
  e.preventDefault();

  const usuario = document.getElementById('usuario').value.trim();
  const pass = document.getElementById('password').value.trim();

  if (!usuario || !pass) {
    alert('Ingrese usuario y contraseña');
    return;
  }

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password: pass })
  })
    .then(res => res.json())
    .then(data => {
      if (data.mensaje !== 'Login correcto') {
        alert(data.mensaje);
        return;
      }

      localStorage.setItem('usuario', data.usuario);
      localStorage.setItem('rol', data.rol);
      localStorage.setItem('token', data.token);

      iniciarSistema(data.usuario, data.rol);
    });
});

function iniciarSistema(usuario, rol) {
  document.getElementById('login').style.display = 'none';
  document.getElementById('sistema').style.display = 'block';

  document.getElementById('usuarioActivo').textContent = usuario;
  document.getElementById('rolActivo').textContent = rol;

  controlarRol();
  cargarMateriales();
  limpiarTrabajadores();
  agregarTrabajador();
}

function controlarRol() {
  const rol = localStorage.getItem('rol');

  document.getElementById('btnExcel').style.display =
    rol === 'admin' ? 'inline-block' : 'none';

  document.getElementById('panelAdmin').style.display =
    rol === 'admin' ? 'block' : 'none';
}

function limpiarTrabajadores() {
  document.getElementById('trabajadores-container').innerHTML = '';
}

function agregarTrabajador() {
  const container = document.getElementById('trabajadores-container');

  const div = document.createElement('div');
  div.style.marginBottom = '20px';

  div.innerHTML = `
    <input class="nombreTrabajador" placeholder="Nombre del trabajador"><br>
    <input class="dniTrabajador" placeholder="DNI" maxlength="8"><br>
    <input class="cargoTrabajador" list="listaCargos" placeholder="Cargo"><br>

    <canvas class="firmaCanvas" width="300" height="120" style="border:1px solid black"></canvas><br>
    <button type="button" class="btnLimpiar">Limpiar firma</button>
  `;

  container.appendChild(div);

  const canvas = div.querySelector('.firmaCanvas');
  activarFirma(canvas);

  div.querySelector('.btnLimpiar').addEventListener('click', () => {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  });
}

document
  .getElementById('btnAgregarTrabajador')
  .addEventListener('click', agregarTrabajador);

function activarFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let dibujando = false;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return e.touches
      ? { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
      : { x: e.offsetX, y: e.offsetY };
  };

  const iniciar = e => {
    e.preventDefault();
    dibujando = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const dibujar = e => {
    if (!dibujando) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const detener = () => {
    dibujando = false;
    ctx.beginPath();
  };

  canvas.addEventListener('mousedown', iniciar);
  canvas.addEventListener('mousemove', dibujar);
  canvas.addEventListener('mouseup', detener);
  canvas.addEventListener('mouseleave', detener);

  canvas.addEventListener('touchstart', iniciar);
  canvas.addEventListener('touchmove', dibujar);
  canvas.addEventListener('touchend', detener);
}

function cargarMateriales() {
  fetch('/api/materiales')
    .then(res => res.json())
    .then(materiales => {
      const cont = document.getElementById('lista-materiales');
      cont.innerHTML = '';

      materiales.forEach(m => {
        cont.innerHTML += `
          <div>
            <strong>${m.nombre}</strong> - S/ ${m.precio}
            Cant:
            <input type="number" class="cant" data-precio="${m.precio}" min="0" value="0">
          </div>
        `;
      });

      document
        .querySelectorAll('.cant')
        .forEach(i => i.addEventListener('input', calcularTotal));
    });
}

function calcularTotal() {
  total = 0;
  document.querySelectorAll('.cant').forEach(i => {
    total += (parseInt(i.value) || 0) * parseFloat(i.dataset.precio);
  });
  document.getElementById('total').textContent = total.toFixed(2);
}

document.getElementById('btnGuardar').addEventListener('click', () => {
  const token = localStorage.getItem('token');
  if (!token) return alert('Sesión no válida');

  const trabajadores = [];

  document.querySelectorAll('#trabajadores-container > div').forEach(div => {
    const nombre = div.querySelector('.nombreTrabajador').value.trim();
    const dni = div.querySelector('.dniTrabajador').value.trim();
    const cargo = div.querySelector('.cargoTrabajador').value.trim();
    const canvas = div.querySelector('.firmaCanvas');
    const firma = canvas.toDataURL('image/png');

    if (nombre && dni) {
      trabajadores.push({ nombre, dni, cargo, firma });
    }
  });

  const materiales = [];
  document.querySelectorAll('#lista-materiales > div').forEach(div => {
    const cant = div.querySelector('.cant');
    if (cant.value > 0) {
      materiales.push({
        nombre: div.querySelector('strong').textContent,
        cantidad: parseInt(cant.value),
        precio: parseFloat(cant.dataset.precio)
      });
    }
  });

  fetch('/api/guardar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({ trabajadores, materiales, total })
  })
    .then(r => r.json())
    .then(d => alert(d.mensaje));
});

function exportarExcel() {
  const token = localStorage.getItem('token');
  window.location.href = `/api/exportar-excel?token=${token}`;
}

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.clear();
  location.reload();
});
