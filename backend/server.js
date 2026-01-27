const express = require('express');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const sesiones = {};

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'frontend')));

function obtenerFecha() {
  return new Date().toISOString().split('T')[0];
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

const usuariosPath = path.join(__dirname, 'usuarios.json');

app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;

  if (!fs.existsSync(usuariosPath)) {
    return res.status(500).json({ mensaje: 'Archivo de usuarios no existe' });
  }

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
    { id: 1, nombre: "Casco de seguridad", precio: 50 },
    { id: 2, nombre: "Guantes de cuero", precio: 20 },
    { id: 3, nombre: "Botas mineras", precio: 120 },
    { id: 4, nombre: "Lámpara frontal", precio: 80 }
  ]);
});

app.post('/api/guardar', verificarSesion, (req, res) => {
  const fechaArchivo = obtenerFecha();
  const dir = path.join(__dirname, 'registros');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const filePath = path.join(dir, `${fechaArchivo}.json`);

  const registro = {
    fecha: new Date(),
    usuario: req.usuario.usuario,
    trabajadores: req.body.trabajadores || [],
    materiales: req.body.materiales || [],
    total: req.body.total || 0
  };

  const registros = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]')
    : [];

  registros.push(registro);
  fs.writeFileSync(filePath, JSON.stringify(registros, null, 2));

  res.json({ mensaje: `Registro guardado (${fechaArchivo})` });
});

app.get('/api/exportar-excel', verificarSesion, async (req, res) => {
  const fechaArchivo = obtenerFecha();
  const filePath = path.join(__dirname, 'registros', `${fechaArchivo}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ mensaje: 'No hay registros hoy' });
  }

  const registros = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ICEMIN');

  sheet.columns = [
    { header: 'Usuario', width: 18 },
    { header: 'Trabajador', width: 25 },
    { header: 'DNI', width: 15 },
    { header: 'Cargo', width: 25 },
    { header: 'Materiales', width: 35 },
    { header: 'Total (S/)', width: 15 },
    { header: 'Fecha', width: 22 },
    { header: 'Firma', width: 30 }
  ];

  let fila = 2;

  registros.forEach(reg => {
    reg.trabajadores.forEach(trab => {
      sheet.addRow([
        reg.usuario,
        trab.nombre,
        trab.dni,
        trab.cargo || '',
        reg.materiales.map(m => `${m.nombre} (${m.cantidad})`).join(', '),
        reg.total,
        new Date(reg.fecha).toLocaleString(),
        ''
      ]);

      if (trab.firma && trab.firma.startsWith('data:image')) {
        const imageId = workbook.addImage({
          base64: trab.firma,
          extension: 'png'
        });

        sheet.addImage(imageId, {
          tl: { col: 7, row: fila - 1 },
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

app.listen(3000, () => {
  console.log('🚀 Servidor activo en http://localhost:3000');
});
