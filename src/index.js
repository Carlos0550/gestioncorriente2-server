const clientDb = require("./databaseConnect.js")
const express = require("express")
const cors = require("cors")
const app = express();
const multer = require("multer");
const { Query } = require("pg");

app.use(express.urlencoded({extended:true}))
app.use(express.json())
app.use(cors())

const storage = multer.memoryStorage();
const upload = multer({storage});

const PORT = process.env.PORT || 4000;


app.post("/save-new-user",upload.none(), async(req,res)=> {
    const client =  await clientDb.connect();
    const { userName, userEmail, userId, userImage } = req.body;
    if (!userName || !userEmail || !userId || !userImage) {
        return res.status(400).json({message: "No fue posible autenticar al usuario, faltan datos."})
    }
    const query1 = `SELECT * FROM usuarios_permitidos WHERE userId = $1`
    const query2 = `INSERT INTO usuarios_permitidos(userName, userEmail, userId, userImage, autorizado) VALUES($1, $2, $3, $4, $5)`;
    const values = [userName, userEmail, userId, userImage, false];
    try {
        const response1 = await client.query(query1,[userId])
        if (response1.rowCount === 0) {
            const response2 = await client.query(query2,values)
            if (response2.rowCount > 0) {
                return res.status(200).json({message: "Se guardo el nuevo usuario, contacte con el administrador para habilitar su acceso."})
            }else{
                return res.status(400).json({message: "No fue posible autenticar al usuario, faltan datos."})
            }
        }
        if (response1.rows[0].autorizado === true && response1.rows[0].administrador === true) {
            return res.status(200).json({message: "Usuario autorizado", autorizado: response1.rows[0].autorizado, administrador: response1.rows[0].administrador, currentUser: response1.rows[0]})
        }else if (response1.rows[0].autorizado === true) {
            return res.status(200).json({message: "Usuario autorizado", autorizado: response1.rows[0].autorizado, administrador: response1.rows[0].administrador, currentUser: response1.rows[0]})
        }else{
            return res.status(403).json({message: "Usuario no autorizado", autorizado: response1.rows[0].autorizado})
        }
        
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al procesar la solicitud"})
    }finally{
        client.release()
    }
})

app.get("/get-all-users", async(req,res)=> {
    const client = await clientDb.connect();
    const query = "SELECT * FROM usuarios_permitidos"
    try {
        const response = await client.query(query)
        return res.status(200).json({usuarios:response.rows})
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al obtener los usuarios"})
    }finally{
        client.release()
    }
});

app.delete("/delete-user/:id", async(req,res)=> {
    const client = await clientDb.connect()
    const { id } = req.params

    if (!id) {
        return res.status(404).json({message: "No se encontro el usuario"})
    }

    const query = `DELETE FROM usuarios_permitidos WHERE id = $1`
    try {
        const response = await client.query(query,[id])
        if (response.rowCount === 0) throw new Error("Error al eliminar el usuario")
        return res.status(200).json({message: "Se elimino el usuario exitosamente!"}) 
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al eliminar el usuario"})
    }finally{
        client.release()
    }
});

app.put("/grant-access/:id", async(req,res)=> {
    const { id } = req.params
    if (!id) {
        return res.status(404).json({message:"No se proporciono el id del usuario"})
    }

    const client = await clientDb.connect()
    const query = `UPDATE usuarios_permitidos SET autorizado = NOT autorizado WHERE id = $1`
    try {
        const response = await client.query(query,[id])
        if (response.rowCount > 0) {
            return res.status(200).json({message:"Se actualizo el acceso"})
        }else{
            return res.status(404).json({message:"No se encontro el usuario"})
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({message:"Error al actualizar el acceso"})
    }finally{
        client.release()
    }
});

app.post("/save-client",upload.none(), async(req,res)=> {
    const { userDni, userEmail, userPhone, userName } = req.body;
    
    if (!userDni || !userName) {
        return res.status(400).json({message: "No es posible crear el cliente, faltan datos!"})
    }

    const query = `INSERT INTO clientes(nombre_completo, dni, telefono, email) VALUES ($1, $2, $3, $4)`
    const values = [userName.toLowerCase(), userDni, userPhone, userEmail]
    const client = await clientDb.connect()

    try {
        const response = await client.query(query,values)
        if (response.rowCount > 0) {
            return res.status(200).json({message: "Cliente guardado exitosamente!"})
        }else{
            return res.status(400).json({message: "No fue posible guardar al cliente."})
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al procesar la solicitud"})
    }finally{
        client.release()
    }
});

app.get("/get-all-clients", async(req,res)=> {
    const client = await clientDb.connect();
    const query = "SELECT * FROM clientes"
    try {
        const response = await client.query(query)
        return res.status(200).json({clientes:response.rows})
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al obtener los clientes"})
    }finally{
        client.release()
    }
});

app.put("/edit-client/:id", upload.none(), async(req,res)=> {
    const { userName, userDni, userEmail, userPhone } = req.body
    const {id} = req.params
    if (!id || !userName || !userDni) {
        return res.status(404).json({message: "Faltan datos obligatorios, verifique que no esté faltando el DNI y el nombre completo!"})
    }
    const client = await clientDb.connect()
    const query = `UPDATE clientes SET nombre_completo = $1, dni = $2, telefono = $3, email = $4 WHERE id = $5`
    try {
        const response = await client.query(query,[userName.toLowerCase(), userDni, userPhone, userEmail, id])
        if (response.rowCount > 0) {
            return res.status(200).send()
        }else{
            throw new Error("Error al actualizar el cliente")
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al procesar la solicitud", error})
    }finally{
        client.release()
    }
})

app.delete("/delete-client/:id", async(req,res)=> {
    const {id} = req.params
    const client = await clientDb.connect()
    const query = `DELETE FROM clientes WHERE id = $1`
    try {
        const response = await client.query(query,[id])
        if (response.rowCount > 0) {
            return res.status(200).json({message: "Se elimino el cliente exitosamente!"})
        }else{
            return res.status(404).json({message: "No se encontro el cliente"})
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al eliminar el cliente"})
    }finally{
        client.release()
    }
});

app.delete("/delete-client", async(req,res)=> {
    const { id } = req.params

    if (!id) {
        return res.status(404).json({message: "No se encontro el cliente"})
    }

    const client = await clientDb.connect()
    const query = `DELETE FROM clientes WHERE id = $1`
    try {
        const response = await client.query(query,[id])
        if (response.rowCount === 0) throw new Error("Error al eliminar el cliente")
        return res.status(200).json({message: "Se elimino el cliente exitosamente!"}) 
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al eliminar el cliente"})
    }finally{
        client.release()
    }
})

app.get("/get-client-file/:id", async (req, res) => {
    const { id } = req.params;
    
    if (!id) {
        return res.status(404).json({ message: "No se proporcionó el ID del cliente." });
    }

    const query1 = "SELECT nombre_completo FROM clientes WHERE id = $1";
    const query2 = "SELECT * FROM deudas WHERE cliente_id = $1";
    const query3 = "SELECT * FROM entregas WHERE deuda_id = $1";

    const client = await clientDb.connect(); 

    try {
        const [nombre_cliente, deudas] = await Promise.all([
            client.query(query1, [id]), 
            client.query(query2, [id])  
        ]);


        const entregas = await Promise.all(
            deudas.rows.map(deuda => client.query(query3, [deuda.id])) 
        );

        return res.status(200).json({
            nombre_cliente: nombre_cliente.rows[0].nombre_completo,
            deudas: deudas.rows,
            entregas: entregas.map(result => result.rows) 
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error de servidor, no se pudo obtener los datos del cliente." });
    } finally {
        client.release();
    }
});

app.post("/save-client-debt/:id", upload.none(), async(req,res)=> {
    const { productos, buyDate, expDate, clientDebtId } = req.body
    const { id } = req.params  
    const insertQuery = `INSERT INTO deudas(cliente_id, detalles, deuda_uuid, fecha_compra, fecha_vencimiento) VALUES ($1, $2, $3,$4, $5)`
    
    const client = await clientDb.connect()
    try {
        const result = await client.query(insertQuery,[id,productos, clientDebtId, buyDate, expDate])
        if (result.rowCount > 0) {
            return res.status(200).json({message: `Se guardó la deuda exitosamente!, su ID de deuda es: ${clientDebtId}`})
        }else{
            throw new Error("Error al guardar la deuda")
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({message: "Error al procesar la solicitud", error})
    }finally{
        client.release()
    }
})















app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`)
})


