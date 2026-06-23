const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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


        // MONGODB COLLECTION

        const usersCollection = db.collection("user");
        const appointmentsCollection = db.collection("appointments");
        const reviewsCollection = db.collection("reviews");
        const paymentsCollection = db.collection("payments");
        const doctorsCollection = db.collection("doctors");


        //  PATIENT DASHBOARD APIs

        // │  1. OVERVIEW

        app.get('/api/patient/overview', async (req, res) => {
            const { userId } = req.query;
            if (!userId) {
                return res.status(400).json({ error: "userId required" });
            }
            try {
                const appointments = await appointmentsCollection.find({ patientId: userId }).toArray();

                const upcoming = appointments.filter((a) => a.appointmentsStatus === "pending" || a.appointmentsStatus === "accepted");

                const payments = await paymentsCollection.find({ patientId: userId }).toArray();

                const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

                res.json({
                    totalAppointments: appointments.length,
                    upcomingAppointments: upcoming.length,
                    totalPayments: totalPaid,
                    paymentCount: payments.length,
                })

            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });


        // 2. MY APPOINTMENTS

        app.get('/api/patient/appointments', async (req, res) => {
            if (!userId) return res.status(400).json({ error: "userId required" });

            try {
                const appointments = await appointmentsCollection.find({ patientId: userId }).sort({ appointmentsDate: -1 }).toArray();
                res.json(appointments)
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });




        // ── Favorite Doctors



        app.get("/api/patient/favorite-doctors", async (req, res) => {
            const { userId } = req.query;
            try {

                const appointments = await appointmentsCollection
                    .find({ patientId: userId })
                    .toArray();

                if (appointments.length === 0) return res.json([]);


                const doctorCountMap = {};
                appointments.forEach((a) => {
                    if (a.doctorId) {
                        doctorCountMap[a.doctorId] = (doctorCountMap[a.doctorId] || 0) + 1;
                    }
                });


                const topDoctorIds = Object.entries(doctorCountMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([id]) => id);


                const doctors = await doctorsCollection
                    .find({ _id: { $in: topDoctorIds } })
                    .toArray();

                res.json(doctors);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('MediCare server run successfully');
});


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});