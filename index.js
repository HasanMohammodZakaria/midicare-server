const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();


const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());







const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        await client.connect();

        const db = client.db(process.env.DATA_BASE_NAME)
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        await client.close();
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('MediCare server run successfully');
});


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});