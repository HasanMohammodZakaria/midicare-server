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
        const prescriptionsCollection = db.collection("prescriptions");

        // ════════════════════════════════════════════════════════════════
        //  PATIENT DASHBOARD APIs


        // 1. OVERVIEW

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
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "userId required" });

            try {
                const appointments = await appointmentsCollection.find({ patientId: userId }).sort({ appointmentsDate: -1 }).toArray();
                res.json(appointments)
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });

        // PATCH /api/patient/appointments/:id/reschedule

        app.get('/api/patient/appointments/:id/reschedule', async (req, res) => {
            const { id } = req.params;
            const { appointmentDate, appointmentsTime } = req.body;
            if (!appointmentDate || !appointmentsTime) {
                return res.status(400).json({ error: "date and time required" });
            }
            try {
                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            appointmentDate,
                            appointmentsTime,
                            appointmentsStatus: "pending",
                        }
                    }
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });

        // PATCH /api/patient/appointments/:id/cancel 

        app.patch('/api/patient/appointments/:id/cancel', async (req, res) => {
            const { id } = req.params;
            try {
                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { appointmentStatus: "cancelled" } }
                );
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });


        // 3. PAYMENT HISTORY 

        app.get('/api/patient/payments', async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "userId required" });
            try {
                const payments = await paymentsCollection.find({ patientId: userId }).sort({ payments: -1 }).toArray();
                res.json(payments);
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });

        // ── PATCH /api/patient/payments/:id/request-refund ─────

        app.patch("/api/patient/payments/:id/request-refund", async (req, res) => {
            const { id } = req.params;
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({ error: "userId is required" });
            }

            try {
                const { ObjectId } = require("mongodb");

                const result = await paymentsCollection.updateOne(
                    { _id: new ObjectId(id), patientId: userId },
                    { $set: { paymentStatus: "refund_requested", refundRequestedAt: new Date() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: "Payment not found" });
                }

                res.json({ success: true, message: "Refund request submitted" });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        // 4. MY REVIEWS
        app.get('/api/patient/reviews', async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "userId required" });
            try {
                const reviews = await reviewsCollection.find({ patientId: userId }).sort({ createdAt: -1 }).toArray();
                res.json(reviews)
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });

        // POST /api/patient/reviews 

        app.post('/api/patient/reviews', async (req, res) => {
            const { patientId, doctorId, rating, reviewText } = req.body;
            if (!patientId || !doctorId || !rating) {
                return res.status(400).json({ error: "required fields missing" });
            }

            try {
                const result = await reviewsCollection.insertOne({
                    patientId,
                    doctorId,
                    rating,
                    reviewText,
                    createdAt: new Date(),
                });
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message })
            }
        });

        // PATCH /api/patient/reviews/:id  

        app.patch("/api/patient/reviews/:id", async (req, res) => {
            const { id } = req.params;
            const { rating, reviewText } = req.body;
            try {
                const result = await reviewsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { rating, reviewText } }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // GET /api/patient/appointments/completed

        app.get("/api/patient/appointments/completed", async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "userId required" });

            try {
                const appointments = await appointmentsCollection
                    .find({
                        patientId: userId,
                        appointmentStatus: "completed",
                    })
                    .sort({ appointmentDate: -1 })
                    .toArray();

                const enriched = await Promise.all(
                    appointments.map(async (appt) => {
                        try {
                            const doctor = await doctorsCollection.findOne({
                                _id: new ObjectId(appt.doctorId),
                            });
                            return {
                                ...appt,
                                doctorName: doctor?.doctorName || null,
                                specialization: doctor?.specialization || null,
                            };
                        } catch {
                            return appt;
                        }
                    })
                );

                res.json(enriched);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


        // DELETE /api/patient/reviews/:id  

        app.delete("/api/patient/reviews/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await reviewsCollection.deleteOne({
                    _id: new ObjectId(id),
                });
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        // 5. PROFILE  

        app.get("/api/patient/profile", async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "userId required" });
            try {
                // Better Auth "user" collection এ id field string হিসেবে থাকে
                const user = await usersCollection.findOne({ id: userId });
                res.json(user);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/patient/profile 

        app.patch("/api/patient/profile", async (req, res) => {
            const { userId, ...updateData } = req.body;
            if (!userId) return res.status(400).json({ error: "userId required" });
            try {
                const result = await usersCollection.updateOne(
                    { id: userId },
                    { $set: updateData }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
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


        // ════════════════════════════════════════════════════════════════
        //  DOCTOR DASHBOARD APIs

        // GET /api/doctor/overview?doctorId=xxx

        app.get("/api/doctor/overview", async (req, res) => {
            const { doctorId } = req.query;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const today = new Date().toISOString().split("T")[0]; // "2026-06-23"

                const allAppointments = await appointmentsCollection
                    .find({ doctorId })
                    .toArray();

                // Unique patients
                const uniquePatients = new Set(allAppointments.map((a) => a.patientId));

                // Today's appointments
                const todaysAppointments = allAppointments.filter(
                    (a) => a.appointmentDate?.startsWith(today)
                );

                // Reviews received
                const reviews = await reviewsCollection
                    .find({ doctorId })
                    .toArray();

                const avgRating = reviews.length
                    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
                    : 0;

                res.json({
                    totalPatients: uniquePatients.size,
                    todaysAppointments: todaysAppointments.length,
                    totalReviews: reviews.length,
                    avgRating: parseFloat(avgRating),
                    totalAppointments: allAppointments.length,
                    pendingAppointments: allAppointments.filter((a) => a.appointmentStatus === "pending").length,
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // GET /api/doctor/appointments
        app.get("/api/doctor/appointments", async (req, res) => {
            const { doctorId, status } = req.query;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const query = { doctorId };
                if (status && status !== "all") query.appointmentStatus = status;

                const appointments = await appointmentsCollection
                    .find(query)
                    .sort({ appointmentDate: -1 })
                    .toArray();

                const enriched = await Promise.all(
                    appointments.map(async (appt) => {
                        try {
                            const patient = await usersCollection.findOne({ id: appt.patientId });
                            return {
                                ...appt,
                                patientName: patient?.name || "Unknown",
                                patientEmail: patient?.email || null,
                                patientImage: patient?.image || null,
                            };
                        } catch {
                            return appt;
                        }
                    })
                );

                res.json(enriched);
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