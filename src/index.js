const clientDb = require("./databaseConnect.js")
const express = require("express")
const cors = require("cors")
const app = express();
const multer = require("multer");
const cron = require("node-cron")
const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc.js")
const timezone = require("dayjs/plugin/timezone.js")

dayjs.extend(utc)
dayjs.extend(timezone)
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.text())
app.use(cors())

const storage = multer.memoryStorage();
const upload = multer({ storage });

const PORT = process.env.PORT || 4000;


app.post("/save-new-user", upload.none(), async (req, res) => {
    const client = await clientDb.connect();
    const { userName, userEmail, userId, userImage } = req.body;

    // Validación de datos
    if (!userName || !userEmail || !userId || !userImage) {
        return res.status(400).json({ message: "No fue posible autenticar al usuario, faltan datos." });
    }

    const queryAdmin = `
        INSERT INTO usuarios_permitidos (userName, userEmail, userId, userImage, autorizado, administrador)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT ON CONSTRAINT uq_unique_user_email DO NOTHING;
    `;

    const query1 = `SELECT * FROM usuarios_permitidos WHERE userEmail = $1`;
    const query2 = `INSERT INTO usuarios_permitidos(userName, userEmail, userId, userImage, autorizado) VALUES($1, $2, $3, $4, $5)`;

    const values = [userName, userEmail, userId, userImage, false];

    try {
        const response1 = await client.query(query1, [userEmail]);
        console.log("Response1:", response1?.rows);

        if (response1.rowCount === 0) {
            if (userEmail === process.env.CLERK_ADMINISTRATOR) {
                const responseAdmin = await client.query(queryAdmin, [userName, userEmail, userId, userImage, true, true]);
                console.log("Response Admin: ", responseAdmin.rows);
                await client.query(query2, values)
                if (responseAdmin.rowCount > 0) {
                    return res.status(200).json({ message: "Bienvenido nuevamente!", autorizado: true, administrador: true, currentUser: responseAdmin.rows[0] });
                }
            }
            const response2 = await client.query(query2, values);
            if (response2.rowCount > 0) {
                return res.status(404).json({ message: "Se guardó el nuevo usuario, contacte con el administrador para habilitar su acceso." });
            } else {
                return res.status(400).json({ message: "No fue posible guardar el nuevo usuario." });
            }
        }

        if (userEmail === process.env.CLERK_ADMINISTRATOR || response1.rows[0].autorizado) {
            return res.status(200).json({ message: response1.rows[0].autorizado ? "Bienvenido nuevamente" : "Usuario autorizado", autorizado: response1.rows[0].autorizado, administrador: response1.rows[0].administrador, currentUser: response1.rows[0] });
        }

        return res.status(403).json({ message: "Usuario no autorizado", autorizado: response1.rows[0].autorizado });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error al procesar la solicitud" });
    } finally {
        client.release();
    }
});


app.get("/get-all-users", async (req, res) => {
    const client = await clientDb.connect();
    const query = "SELECT * FROM usuarios_permitidos"
    try {
        const response = await client.query(query)
        return res.status(200).json({ usuarios: response.rows })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error al obtener los usuarios" })
    } finally {
        client.release()
    }
});

app.delete("/delete-user/:id", async (req, res) => {
    const client = await clientDb.connect()
    const { id } = req.params

    if (!id) {
        return res.status(404).json({ message: "No se encontro el usuario" })
    }

    const query = `DELETE FROM usuarios_permitidos WHERE id = $1`
    try {
        const response = await client.query(query, [id])
        if (response.rowCount === 0) throw new Error("Error al eliminar el usuario")
        return res.status(200).json({ message: "Se elimino el usuario exitosamente!" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error al eliminar el usuario" })
    } finally {
        client.release()
    }
});

app.put("/grant-access/:id", async (req, res) => {
    const { id } = req.params
    if (!id) {
        return res.status(404).json({ message: "No se proporciono el id del usuario" })
    }

    const client = await clientDb.connect()
    const query = `UPDATE usuarios_permitidos SET autorizado = NOT autorizado WHERE id = $1`
    try {
        const response = await client.query(query, [id])
        if (response.rowCount > 0) {
            return res.status(200).json({ message: "Se actualizo el acceso" })
        } else {
            return res.status(404).json({ message: "No se encontro el usuario" })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error al actualizar el acceso" })
    } finally {
        client.release()
    }
});

app.post("/save-client", upload.none(), async (req, res) => {
    const { userDni, userEmail, userPhone, userName } = req.body;

    if (!userDni || !userName) {
        return res.status(400).json({ message: "No es posible crear el cliente, faltan datos!" })
    }

    const query = `INSERT INTO clientes(nombre_completo, dni, telefono, email) VALUES ($1, $2, $3, $4)`
    const values = [userName.toLowerCase(), userDni, userPhone, userEmail]
    const client = await clientDb.connect()

    try {
        const response = await client.query(query, values)
        if (response.rowCount > 0) {
            return res.status(200).json({ message: "Cliente guardado exitosamente!" })
        } else {
            return res.status(400).json({ message: "No fue posible guardar al cliente." })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error al procesar la solicitud" })
    } finally {
        client.release()
    }
});

app.get("/get-all-clients", async (req, res) => {
    const client = await clientDb.connect();
    const query = "SELECT * FROM clientes"
    try {
        const response = await client.query(query)
        return res.status(200).json({ clientes: response.rows })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error al obtener los clientes" })
    } finally {
        client.release()
    }
});

app.put("/edit-client/:id", upload.none(), async (req, res) => {
    const { userName, userDni, userEmail, userPhone } = req.body
    const { id } = req.params
    if (!id || !userName || !userDni) {
        return res.status(404).json({ message: "Faltan datos obligatorios, verifique que no esté faltando el DNI y el nombre completo!" })
    }
    const client = await clientDb.connect()
    const query = `UPDATE clientes SET nombre_completo = $1, dni = $2, telefono = $3, email = $4 WHERE id = $5`
    try {
        const response = await client.query(query, [userName.toLowerCase(), userDni, userPhone, userEmail, id])
        if (response.rowCount > 0) {
            return res.status(200).send()
        } else {
            throw new Error("Error al actualizar el cliente")
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error al procesar la solicitud", error })
    } finally {
        client.release()
    }
})

app.delete("/delete-client/:id", async (req, res) => {
    const { id } = req.params

    if (!id) {
        return res.status(404).json({ message: "No se encontro el cliente" })
    }

    const client = await clientDb.connect()
    const query4 = `DELETE FROM clientes WHERE id = $1`
    const query3 = `DELETE FROM deudas WHERE cliente_id = $1`
    const query2 = `DELETE FROM entregas WHERE id_entrega_cliente = $1`
    const query1 = `DELETE FROM historial_deudas WHERE historial_cliente_id = $1`
    try {
        await client.query("BEGIN")
        await client.query(query1, [id]);
        const [responses] = await Promise.all([
            client.query(query2, [id]),
            client.query(query3, [id]),
            client.query(query4, [id]),
        ]);
        if (responses.rowCount[2] === 0) {
            throw new Error("Error al eliminar el cliente, intente nuevamente!")
        }

        await client.query("COMMIT")
        return res.status(200).json({ message: "Se elimino el cliente exitosamente!" })

    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({ message: error.message || "Error al eliminar el cliente" })
    } finally {
        client.release()
    }
});

app.delete("/delete-client", async (req, res) => {

})

app.get("/get-client-file/:id", async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(404).json({ message: "No se proporcionó el ID del cliente." });
    }

    const query1 = "SELECT nombre_completo FROM clientes WHERE id = $1";
    const query2 = "SELECT * FROM deudas WHERE cliente_id = $1";
    const query3 = "SELECT * FROM entregas WHERE id_entrega_cliente = $1";

    const client = await clientDb.connect();

    try {
        const [nombre_cliente, deudas, entregas] = await Promise.all([
            client.query(query1, [id]),
            client.query(query2, [id]),
            client.query(query3, [id])
        ]);




        return res.status(200).json({
            nombre_cliente: nombre_cliente.rows[0].nombre_completo,
            deudas: deudas.rows,
            entregas: entregas.rows
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error de servidor, no se pudo obtener los datos del cliente." });
    } finally {
        client.release();
    }
});

app.post("/save-client-debt/:id", upload.none(), async (req, res) => {
    const { productos, buyDate, expDate, clientDebtId } = req.body
    const { id } = req.params
    const insertQuery = `INSERT INTO deudas(cliente_id, detalles, deuda_uuid, fecha_compra, fecha_vencimiento) VALUES ($1, $2, $3,$4, $5)`

    const client = await clientDb.connect()
    try {
        const result = await client.query(insertQuery, [id, productos, clientDebtId, buyDate, expDate])
        if (result.rowCount > 0) {
            return res.status(200).json({ message: `Se guardó la deuda exitosamente!, su ID de deuda es: ${clientDebtId}` })
        } else {
            throw new Error("Error al guardar la deuda")
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error al procesar la solicitud", error })
    } finally {
        client.release()
    }
})

app.post("/save-client-deliver/:id", upload.none(), async (req, res) => {
    const { id } = req.params
    const { deliversData } = req.body
    if (!deliversData) {
        return res.status(400).json({ message: "No se pudo guardar la entrega, faltan datos obligatorios!" })
    }
    const insertQuery = `INSERT INTO entregas(detalle_entrega, id_entrega_cliente) VALUES ($1, $2)`
    const updateQuery = `UPDATE deudas SET estado = true WHERE cliente_id = $1`

    const client = await clientDb.connect()
    try {
        await client.query("BEGIN")
        const result = await client.query(insertQuery, [deliversData, id])
        if (result.rowCount === 0) throw new Error("Error al guardar la entrega, intente nuevamente!")
        const result2 = await client.query(updateQuery, [id])
        if (result2.rowCount === 0) throw new Error("Error al actualizar el estado de la deuda, intente nuevamente!")
        await client.query("COMMIT")
        return res.status(200).json({ message: "Entrega guardada y estado de deuda actualizado!" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error de servidor, no se pudo guardar la entrega" })
    } finally {
        client.release
    }
})

app.put("/update-client-deliver/:id", upload.none(), async (req, res) => {
    const { id } = req.params
    const { deliversData } = req.body
    if (!deliversData) {
        return res.status(400).json({ message: "No se pudo guardar la entrega, faltan datos obligatorios!" })
    }
    const insertQuery = `UPDATE entregas SET detalle_entrega = $1 WHERE id = $2`
    const client = await clientDb.connect()
    try {
        const result = await client.query(insertQuery, [deliversData, id])
        if (result.rowCount > 0) {
            return res.status(200).json({ message: "Entrega guardada!" })
        }
        return res.status(400).json({ message: "Error al guardar la entrega, por favor intente nuevamente" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error de servidor, no se pudo guardar la entrega" })
    } finally {
        client.release()
    }
});

app.delete("/delete-client-deliver/:id", async (req, res) => {
    const { id } = req.params
    const query = `DELETE FROM entregas WHERE id = $1`
    const client = await clientDb.connect()
    try {
        if (!id) {
            throw new Error("No se pudo obtener el ID de la entrega, intente nuevamente!")
        }

        const result = await client.query(query, [id])
        if (!result.rowCount > 0) throw new Error("Error eliminando la entrega, intente nuevamente!")
        return res.status(200).json({ message: "Entrega eliminada exitosamente" })

    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error interno del servidor al eliminar la entrega, intente nuevamente!" })
    } finally {
        client.release()
    }
})

app.put("/update-client-debt/:clientId", upload.none(), async (req, res) => {
    const { productos, buyDate, expDate, clientDebtId } = req.body

    const updateQuery = `UPDATE deudas SET fecha_compra = $1, fecha_vencimiento = $2, detalles = $3 WHERE deuda_uuid = $4`
    const client = await clientDb.connect()
    try {
        if (!productos || !buyDate || !expDate || !clientDebtId) {
            throw new Error("No se pudo actualizar la deuda, faltan datos obligatorios!")
        }
        const result = await client.query(updateQuery, [buyDate, expDate, productos, clientDebtId])
        if (result.rowCount === 0) throw new Error("Error al actualizar la deuda, intente nuevamente!")
        return res.status(200).json({ message: "Deuda actualizada" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error interno del servidor al actualizar la deuda, intente nuevamente!" })
    } finally {
        client.release()
    }
})

app.delete("/delete-client-debt/:debtId", async (req, res) => {
    const { debtId } = req.params
    const query = `DELETE FROM deudas WHERE deuda_uuid = $1`
    const client = await clientDb.connect()
    try {
        if (!debtId) throw new Error("No se proporcionó el ID de la deuda, intente nuevamente!")
        const result = await client.query(query, [debtId])
        if (result.rowCount === 0) throw new Error("Error al eliminar la deuda, intente nuevamente!")
        return res.status(200).json({ message: "Deuda eliminada exitosamente" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error interno del servidor al eliminar la deuda, intente nuevamente!" })
    } finally {
        client.release()
    }
});

cron.schedule("*/45 * * * *", async () => {
    const client = await clientDb.connect()
    const argentinaTime = dayjs().tz("America/Buenos_Aires").format("YYYY-MM-DD")
    const query = `UPDATE deudas SET estado = false WHERE fecha_vencimiento <= $1 AND estado = true RETURNING *`
    try {
        console.log("EJECUTANDO TAREAS CRON")
        const response = await client.query(query, [argentinaTime])
        if (response.rowCount > 0) {
            console.log(`Vencimiento de deudas actualizadas exitosamente!, ${response.rowCount} deudas actualizadas`)
        } else {
            console.log("Ninguna deuda vencida!")

        }
    } catch (error) {
        console.log("Error ejecutando la tarea CRON", error)
    } finally {
        console.log("TAREAS CRON FINALIZADAS!")
        client.release()
    }
});

app.post("/cancel-client-debts/:clientId", async (req, res) => {
    const { clientId } = req.params
    const client = await clientDb.connect()
    const query1 = `SELECT * FROM deudas WHERE cliente_id = $1`
    const query2 = `SELECT* FROM entregas WHERE id_entrega_cliente = $1`
    const query3 = `INSERT INTO historial_deudas(historial_cliente_id, detalle_entregas, detalle_deudas, fecha_cancelacion) VALUES ($1, $2, $3, $4)`
    const query4 = `DELETE FROM deudas WHERE cliente_id = $1`
    const query5 = "DELETE FROM entregas WHERE id_entrega_cliente = $1"

    if (!clientId) {
        return res.status(404).json({ message: "No se pudo cancelar la deuda, intente nuevamente!" })
    }

    try {
        await client.query("BEGIN")
        const [debts, deliveries] = await Promise.all([
            client.query(query1, [clientId]),
            client.query(query2, [clientId])
        ])

        if (debts.rowCount === 0 || deliveries.rowCount === 0) throw new Error("El cliente no tiene deudas o entregas para poder hacer una cancelación, intente nuevamente más tarde!")
        const serializeDebts = JSON.stringify(debts.rows)
        const serializeDeliveries = JSON.stringify(deliveries.rows)

        const result = await client.query(query3, [clientId, serializeDebts, serializeDeliveries, dayjs().format("YYYY-MM-DD HH:mm:ss")])
        if (result.rowCount === 0) throw new Error("Error cancelando la deuda, intente nuevamente!")
        const result2 = await Promise.all([
            client.query(query4, [clientId]),
            client.query(query5, [clientId])
        ])

        if (result2[0].rowCount === 0 || result2[1].rowCount === 0) throw new Error("Error cancelando la deuda, intente nuevamente!")
        await client.query("COMMIT")
        return res.status(200).json({ message: "Deuda cancelada exitosamente!" })
    } catch (error) {
        console.log(error)
        await client.query("ROLLBACK")
        return res.status(500).json({ message: error.message || "Error interno del servidor al cancelar la deuda, intente nuevamente!" })
    } finally {
        client.release()
    }
});

app.get("/get-all-expirations", async (req, res) => {
    const selectQuery1 = `SELECT * FROM deudas WHERE estado = false`
    const selectQuery2 = `SELECT nombre_completo, id FROM clientes`
    const client = await clientDb.connect()
    try {
        const [debts, clients] = await Promise.all([
            client.query(selectQuery1),
            client.query(selectQuery2)
        ])

        if (debts.rowCount === 0) {
            return res.status(200).json({ message: "No se encontraron deudas vencidas" })
        }
        const processedDebts = debts.rows.map(debt => {
            return {
                id: debt.id,
                fechaVencimiento: dayjs(debt.fecha_vencimiento).format("DD/MM/YYYY"),
                cliente: clients.rows.find(client => client.id === debt.cliente_id).nombre_completo,
                clientId: debt.cliente_id
            }
        })

        const uniqueClients = processedDebts.reduce((acc, curr) => {
            const found = acc.find(item => item.clientId === curr.clientId)
            if (found) {
                found.deudasVencidas += 1;
                found.fechaVencimiento.push(curr.fechaVencimiento)
            } else {
                acc.push({
                    clientId: curr.clientId,
                    cliente: curr.cliente,
                    deudasVencidas: 1,
                    fechaVencimiento: [curr.fechaVencimiento]
                })
            }
            return acc
        }, [])
        return res.status(200).json({
            vencimientos: uniqueClients.sort((a, b) => a.clientId - b.clientId)
        })

    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error al obtener los vencimientos" })
    } finally {
        client.release()
    }
})

app.post("/save-action-logs", async (req, res) => {
    const {
        userId,
        userName,
        userImage,
        actionType,
        entity,
        oldData,
        newData,
        details,
        day,
        time
    } = req.body
    const query = `
        INSERT INTO reports(user_id, user_name, user_image, action_type, entity, old_data, new_data, details, day, time) VALUES ($1, $2, $3, $4, $5,$6, $7, $8, $9, $10)
    `
    const insertValues = [userId, userName, userImage, actionType, entity, oldData, newData, details, day, time]

    const client = await clientDb.connect()
    try {
        console.log(req.body)
        const response = await client.query(query, insertValues)
        console.log(response)
        if (response.rowCount === 0) throw new Error("No se pudo insertar los logs", response)
        return res.status(200).send()
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error al guardar los logs." })
    } finally {
        client.release()
    }
});

app.get("/get-logs", async (req, res) => {
    const query = `SELECT * FROM reports`
    const client = await clientDb.connect()
    try {
        const result = await client.query(query)
        if (result.rowCount > 0) {
            return res.status(200).json({ message: "Reportes Obtenidos!", reports: result.rows })
        } else {
            return res.status(404).json({ message: "No se encontraron reportes.", reports: [] })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error en el servidor al obtener los reportes." })
    } finally {
        client.release()
    }
});

app.get("/get-dashboard-data", async (req, res) => {
    const startMonth = dayjs().tz("America/Buenos_Aires").startOf("month").format("YYYY-MM-DD");
    const endMonth = dayjs().tz("America/Buenos_Aires").endOf("month").format("YYYY-MM-DD");

    const query1 = `SELECT * FROM entregas
        WHERE create_date >= $1 AND
        create_date <= $2`;

    const query2 = `SELECT * FROM deudas
        WHERE fecha_vencimiento >= $1 AND
        fecha_vencimiento <= $2 AND estado = $3`;

    const client = await clientDb.connect();

    try {
        const [pagos, vencimientos] = await Promise.all([
            client.query(query1, [startMonth, endMonth]),
            client.query(query2, [startMonth, endMonth, true])
        ]);

        return res.status(200).json({
            pagos: pagos.rows,
            vencimientos: vencimientos.rows
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Error en el servidor al obtener la información" });
    } finally {
        client.release();
    }
});

app.post("/save-branch", async (req, res) => {
    const client = await clientDb.connect()
    const insertQuery = `INSERT INTO puntos_venta(business_name) VALUES($1)`;
    const businessName = req.body;
    if (!businessName || businessName === null || businessName === undefined) return res.status(204).json({ message: "No se proporcionó el nombre de la nueva sucursal." });

    try {
        const response = await client.query(insertQuery, [businessName])

        if (response.rowCount === 0) throw new Error("Error al guardar la nueva sucursal.")

        return res.status(200).json({ message: "Sucursal guardada!" })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error del servidor al guardar la nueva sucursal." })
    } finally {
        client.release()
    }
});

app.get("/get-branches", async (req, res) => {
    const client = await clientDb.connect()
    const getQuery = `SELECT * FROM puntos_venta`
    try {
        const result = await client.query(getQuery)

        if (result.rowCount === 0) return res.status(404).json({ message: "No se registraron sucursales, puedes guardar una ahora" })

        return res.status(200).json({ sucursales: result.rows })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: error.message || "Error en el servidor, intente nuevamente." })
    } finally {
        client.release()
    }
});

app.put("/edit-branch-name", async (req, res) => {
    const { branchId, branchName } = req.body
    const client = await clientDb.connect()
    if (!branchId || !branchName) {
        return res.status(406).json({ message: "No se recibió el Nombre o el ID de la nueva sucursal." })
    }
    const query = `UPDATE puntos_venta SET business_name = $1 WHERE id = $2`


    try {
        const response = await client.query(query, [branchName, branchId])

        if (response.rowCount === 0) return res.status(404).json({ message: "No se encontró en la base de datos la sucursal seleccionada." })

        return res.status(200).json({ message: "Sucursal actualizada!" })

    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error en el servidor, intente nuevamente." })
    } finally {
        client.release()
    }
})

app.delete("/delete-branch/:id", async (req, res) => {
    const { id } = req.params
    console.log(id)
    if (!id) {
        return res.status(400).json({ message: "El ID no fue proporcionado o no se encontró en la base de datos." })
    }
    const deleteQuery = `DELETE FROM puntos_venta WHERE id = $1`
    const client = await clientDb.connect()
    try {
        const result = await client.query(deleteQuery, [id])
        console.log(result)
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "No se encontró ningún registro con ese ID." });
        }

        return res.status(200).send()
    } catch (error) {
        console.log(error)

        return res.status(500).json({ message: "Error en el servidor, por favor, intente nuevamente." })
    } finally {
        client.release()
    }
});

app.put("/change-branch-user/:id", async (req, res) => {
    const { id } = req.params
    const { userId } = req.query
    console.log(`ID: ${id}, UserID: ${userId}`);
    if (!id || !userId) return res.status(400).json({ message: "No se pudo asignar la sucursal al usuario, intente nuevamente" })

    const client = await clientDb.connect()
    const query = `UPDATE usuarios_permitidos SET id_punto_venta = $1 WHERE userid = $2`

    try {
        const result = await client.query(query, [id, userId])

        if (result.rowCount === 0) return res.status(404).json({ message: "La sucursal o el usuario no fue encontrado, intente nuevamente" })
        return res.status(200).json({ message: "Sucursal asignada correctamente." })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Error interno del servidor, intente nuevamente" })
    } finally {
        client.release()
    }
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})


