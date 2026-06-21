import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// Conexión directa a tu XAMPP
const db = mysql.createPool({
    host: '89.117.9.74',
    user: 'u365087007_raiz',
    password: 'Diverweb1530',
    database: 'u365087007_diverweb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar a XAMPP:', err);
        return;
    }
    console.log('¡Backend conectado a MySQL en XAMPP usando Pool!');
    connection.release();
});

// Ruta para guardar usuarios desde el formulario
app.post('/api/registro', async (req, res) => {
    const { correo, contrasena, rol, servicio } = req.body;
    const rolFinal = rol === 'provider' ? 'proveedor' : 'cliente';

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedContrasena = await bcrypt.hash(contrasena, salt);

        console.log('\n--- NUEVO REGISTRO ---');
        console.log('Correo:', correo);
        console.log('Rol solicitado:', rolFinal);
        console.log('----------------------\n');

        const query = 'INSERT INTO usuario (CORREO, CONTRASEÑA, rol, servicio) VALUES (?, ?, ?, ?)';
        const params = [correo, hashedContrasena, rolFinal, servicio || null].map(p => p === undefined ? null : p);
        db.query(query, params, (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(200).json({
                message: 'Usuario guardado con éxito',
                hashedPassword: hashedContrasena
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al encriptar la contraseña' });
    }
});
// NUEVA RUTA: Para guardar los apartados de fechas (cualquier otro servicio)
app.post('/api/apartar', (req, res) => {
    const { id_usuario, fecha_evento, hora_inicio, numero_ninos, direccion, tipo_evento } = req.body;

    const datetime_inicio = `${fecha_evento} ${hora_inicio}:00`;
    const query = 'INSERT INTO apartar_fecha (id_usuario, FECHA_EVENTO, HORA_INICIO, NUMERO_NIÑOS, DIRECCION, TIPO_EVENTO) VALUES (?, ?, ?, ?, ?, ?)';

    const params = [id_usuario, fecha_evento, datetime_inicio, numero_ninos, direccion, tipo_evento].map(p => p === undefined ? null : p);

    db.query(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: '¡Fecha apartada con éxito!' });
    });
});

// NUEVA RUTA: Para guardar la reservación de un Salón
app.post('/api/apartar_salon', (req, res) => {
    const { id_usuario, nombre, fecha_evento, hora_inicio, numero_personas, tipo_evento } = req.body;

    const datetime_inicio = `${fecha_evento} ${hora_inicio}:00`;
    const query = 'INSERT INTO apartar_salon (id_usuario, NOMBRE, FECHA_EVENTO, HORA_INICIO, NUMERO_PERSONAS, TIPO_EVENTO) VALUES (?, ?, ?, ?, ?, ?)';

    const params = [id_usuario, nombre, fecha_evento, datetime_inicio, numero_personas, tipo_evento].map(p => p === undefined ? null : p);

    db.query(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: '¡Salón apartado con éxito!' });
    });
});
// NUEVA RUTA: Para guardar mensajes de contacto
app.post('/api/contacto', upload.single('imagen'), (req, res) => {
    const { nombre, correo, mensaje } = req.body;
    const imagenPath = req.file ? `/uploads/${req.file.filename}` : null;

    const query = 'INSERT INTO contacto (NOMBRE, CORREO, MENSAJE, IMAGEN) VALUES (?, ?, ?, ?)';
    const params = [nombre, correo, mensaje, imagenPath].map(p => p === undefined ? null : p);

    db.query(query, params, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json({ message: '¡Mensaje guardado con éxito!' });
    });
});

// NUEVA RUTA: Para que el administrador vea los comentarios
app.get('/api/comentarios', (req, res) => {
    const query = 'SELECT * FROM contacto ORDER BY fecha_envio DESC';

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json(results);
    });
});



// NUEVA RUTA: Para iniciar sesión con cuentas que ya existen
app.post('/api/login', (req, res) => {
    const { correo, contrasena, servicio } = req.body;

    // Buscamos si existe un usuario con ese correo
    const query = 'SELECT * FROM usuario WHERE CORREO = ?';
    const params = [correo].map(p => p === undefined ? null : p);

    db.query(query, params, async (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Si encontramos al menos una fila, verificamos la contraseña
        if (results.length > 0) {
            const user = results[0];

            // Si es proveedor y viene con un servicio desde el frontend (login), lo actualizamos o vinculamos
            if (user.rol === 'proveedor' && servicio) {
                user.servicio = servicio;
                db.query("UPDATE usuario SET servicio = ? WHERE id_usuario = ?", [servicio, user.id_usuario]);
            }

            const isMatch = await bcrypt.compare(contrasena, user.CONTRASEÑA);

            console.log('\n--- INTENTO DE LOGIN ---');
            console.log('Correo que intenta entrar:', correo);
            console.log('Contraseña ingresada (texto plano):', contrasena);
            console.log('Contraseña encriptada en BD:', user.CONTRASEÑA);
            console.log('¿Coinciden los hashes?:', isMatch);
            console.log('------------------------\n');

            if (isMatch || contrasena === user.CONTRASEÑA) {
                res.status(200).json({
                    message: '¡Bienvenido de vuelta!',
                    user: {
                        id_usuario: user.id_usuario,
                        correo: user.CORREO,
                        rol: user.rol,
                        servicio: user.servicio || null
                    },
                    hashStored: user.CONTRASEÑA
                });
            } else {
                res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
            }
        } else {
            res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        }
    });
});

// NUEVA RUTA: Para obtener las reservaciones (para cliente o proveedor)
app.get('/api/reservaciones', (req, res) => {
    const { id_usuario, rol, nombre_proveedor } = req.query;

    let queryFecha = 'SELECT a.*, u.CORREO as nombre_cliente, "fecha" as tipo_reserva FROM apartar_fecha a LEFT JOIN usuario u ON a.id_usuario = u.id_usuario';
    let querySalon = 'SELECT a.*, u.CORREO as nombre_cliente, "salon" as tipo_reserva FROM apartar_salon a LEFT JOIN usuario u ON a.id_usuario = u.id_usuario';

    let paramsFecha = [];
    let paramsSalon = [];

    if (rol === 'proveedor' && nombre_proveedor) {
        queryFecha += ' WHERE a.TIPO_EVENTO LIKE ?';
        querySalon += ' WHERE a.TIPO_EVENTO LIKE ?';
        const likeString = `%${nombre_proveedor}%`;
        paramsFecha = [likeString];
        paramsSalon = [likeString];
    } else if (rol !== 'proveedor' && id_usuario) {
        queryFecha += ' WHERE a.id_usuario = ?';
        querySalon += ' WHERE a.id_usuario = ?';
        paramsFecha = [id_usuario];
        paramsSalon = [id_usuario];
    }

    db.query(queryFecha, paramsFecha, (err1, resultsFecha) => {
        if (err1) console.error("Error en queryFecha:", err1);

        db.query(querySalon, paramsSalon, (err2, resultsSalon) => {
            if (err2) console.error("Error en querySalon:", err2);

            const rFecha = (resultsFecha || []).map(r => ({
                id: r.id || r.id_apfecha || r.ID,
                nombre_servicio: "Servicio Externo",
                fecha: r.FECHA_EVENTO,
                hora: r.HORA_INICIO,
                tipo: r.TIPO_EVENTO,
                estado: r.estado || 'PENDIENTE',
                tipo_reserva: r.tipo_reserva,
                nombre_cliente: r.nombre_cliente
            }));

            const rSalon = (resultsSalon || []).map(r => ({
                id: r.id || r.id_apsalon || r.ID,
                nombre_servicio: r.NOMBRE || "Salón de Fiestas",
                fecha: r.FECHA_EVENTO,
                hora: r.HORA_INICIO,
                tipo: r.TIPO_EVENTO,
                estado: r.estado || 'PENDIENTE',
                tipo_reserva: r.tipo_reserva,
                nombre_cliente: r.nombre_cliente
            }));

            const combined = [...rFecha, ...rSalon].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            res.status(200).json(combined);
        });
    });
});

// NUEVA RUTA: Para actualizar el estado de una reservación (Validar, Cancelar, Editar)
app.put('/api/reservaciones/:tipo_reserva/:id', (req, res) => {
    const { tipo_reserva, id } = req.params;
    const { estado } = req.body;

    const tabla = tipo_reserva === 'salon' ? 'apartar_salon' : 'apartar_fecha';
    const initCol = tipo_reserva === 'salon' ? 'id_apsalon' : 'id';

    const tryUpdate = (colId) => {
        const query = `UPDATE ${tabla} SET estado = ? WHERE ${colId} = ?`;
        db.query(query, [estado, id], (err, result) => {
            if (err) {
                if (err.code === 'ER_BAD_FIELD_ERROR' && colId !== 'id') {
                    tryUpdate('id');
                } else if (err.code === 'ER_BAD_FIELD_ERROR' && colId === 'id') {
                    tryUpdate('id_apfecha');
                } else {
                    return res.status(500).json({ error: err.message });
                }
            } else {
                res.status(200).json({ message: 'Estado actualizado correctamente' });
            }
        });
    };

    tryUpdate(initCol);
});

// --- CONFIGURACIÓN PARA HOSTINGER (Sirviendo React) ---
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto', PORT);
});

// --- SCRIPT TEMPORAL DE ACTUALIZACION DE CONTRASEÑAS ---
setTimeout(async () => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashM = await bcrypt.hash("3006", salt);
        const hashD = await bcrypt.hash("283006", salt);
        db.query("UPDATE usuario SET CONTRASEÑA=? WHERE CORREO='miranda@gmail.com'", [hashM]);
        db.query("UPDATE usuario SET CONTRASEÑA=? WHERE CORREO='danna@gmail.com'", [hashD]);
        console.log("¡CONTRASEÑAS DE MIRANDA Y DANNA ACTUALIZADAS CON EXITO!");
    } catch (e) {
        console.log("Error actualizando: ", e);
    }
}, 2000);
// ---------------------------------------------------------