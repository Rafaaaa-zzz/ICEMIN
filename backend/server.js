const express = require('express');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

const sesiones = {};
const usuariosPath = path.join(__dirname, 'usuarios.json');
const registrosDir = path.join(__dirname, 'registros');

function obtenerFechaHoraLima() {
  return new Date().toLocaleString('es-PE', {
    timeZone: 'America/Lima'
  });
}

function obtenerFechaArchivo() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Lima'
  });
}

function generarCodigoOrden(registros, fechaArchivo) {
  const fecha = fechaArchivo.replace(/-/g, '');
  const numero = registros.length + 1;
  return `ORD-${fecha}-${String(numero).padStart(3, '0')}`;
}

function verificarSesion(req, res, next) {
  let token = req.headers['authorization'] || req.query.token;

  if (token && token.startsWith('Bearer ')) {
    token = token.split(' ')[1];
  }

  if (!token || !sesiones[token]) {
    req.usuario = { usuario: 'SIN_SESION', rol: 'operador' };
    return next();
  }

  req.usuario = sesiones[token];
  next();
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ mensaje: 'Acceso solo para administrador' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;

  const usuarios = JSON.parse(fs.readFileSync(usuariosPath, 'utf8'));
  const encontrado = usuarios.find(
    u => u.usuario === usuario && u.password === password
  );

  if (!encontrado) {
    return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos' });
  }

  const token = Math.random().toString(36).substring(2);

  sesiones[token] = {
    usuario: encontrado.usuario,
    rol: encontrado.rol
  };

  res.json({
    mensaje: 'Login correcto',
    token,
    usuario: encontrado.usuario,
    rol: encontrado.rol
  });
});

app.get('/api/materiales', (req, res) => {
  res.json([
    { id: 1, nombre: 'Casco de seguridad', precio: 50 },
    { id: 2, nombre: 'Guantes de cuero', precio: 20 },
    { id: 3, nombre: 'Botas mineras', precio: 120 },
    { id: 4, nombre: 'Lámpara frontal', precio: 80 }
  ]);
});

app.post('/api/guardar', verificarSesion, (req, res) => {
  if (!fs.existsSync(registrosDir)) fs.mkdirSync(registrosDir);

  const fechaArchivo = obtenerFechaArchivo();
  const filePath = path.join(registrosDir, `${fechaArchivo}.json`);

  const registros = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : [];

  const codigoOrden = generarCodigoOrden(registros, fechaArchivo);

  const registro = {
    codigoOrden,
    fecha: obtenerFechaHoraLima(),
    usuario: req.usuario.usuario,
    rol: req.usuario.rol,
    trabajadores: req.body.trabajadores || [],
    materiales: req.body.materiales || [],
    total: req.body.total || 0
  };

  registros.push(registro);
  fs.writeFileSync(filePath, JSON.stringify(registros, null, 2));

  res.json({
    mensaje: 'Registro guardado correctamente ✅',
    codigoOrden
  });
});

app.get('/api/exportar-excel', verificarSesion, soloAdmin, async (req, res) => {
  const fechaArchivo = req.query.fecha || obtenerFechaArchivo();
  const filePath = path.join(registrosDir, `${fechaArchivo}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ mensaje: 'No hay registros' });
  }

  const registros = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ICEMIN');

  sheet.columns = [
    { header: 'Código Orden', width: 22 },
    { header: 'Usuario', width: 18 },
    { header: 'Trabajador', width: 25 },
    { header: 'DNI', width: 15 },
    { header: 'Cargo', width: 25 },
    { header: 'Materiales', width: 45 },
    { header: 'Total (S/)', width: 15 },
    { header: 'Fecha', width: 22 },
    { header: 'Firma', width: 30 }
  ];

  let fila = 2;

  registros.forEach(reg => {
    const materialesTexto = reg.materiales
      .map(m => `• ${m.nombre} (${m.cantidad})`)
      .join('\n');

    reg.trabajadores.forEach(trab => {
      sheet.addRow([
        reg.codigoOrden,
        reg.usuario,
        trab.nombre,
        trab.dni,
        trab.cargo || '',
        materialesTexto,
        reg.total,
        reg.fecha,
        ''
      ]);

      sheet.getCell(`F${fila}`).alignment = {
        wrapText: true,
        vertical: 'top'
      };

      if (trab.firma && trab.firma.startsWith('data:image')) {
        const imageId = workbook.addImage({
          base64: trab.firma,
          extension: 'png'
        });

        sheet.addImage(imageId, {
          tl: { col: 8, row: fila - 1 },
          ext: { width: 160, height: 70 }
        });

        sheet.getRow(fila).height = 60;
      }

      fila++;
    });
  });

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=ICEMIN_${fechaArchivo}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
});

app.listen(PORT, () => {
  console.log('ICEMIN API ACTIVA 🚀');
});
