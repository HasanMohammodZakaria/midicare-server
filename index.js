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


        // GET /api/doctor/schedule?doctorId=xxx

        app.get("/api/doctor/schedule", async (req, res) => {
            const { doctorId } = req.query;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const doctor = await doctorsCollection.findOne({ userId: doctorId });
                if (!doctor) return res.json({
                    availableDays: [],
                    availableSlots: [],
                });

                res.json({
                    availableDays: doctor.availableDays || [],
                    availableSlots: doctor.availableSlots || [],
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/doctor/schedule

        app.patch("/api/doctor/schedule", async (req, res) => {
            const { doctorId, availableDays, availableSlots } = req.body;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const result = await doctorsCollection.updateOne(
                    { userId: doctorId },
                    { $set: { availableDays, availableSlots, userId: doctorId } },
                    { upsert: true }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        //  3. APPOINTMENT REQUESTS


        // GET /api/doctor/appointments?doctorId=xxx

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

                // Patient info enrich করো
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

        // PATCH /api/doctor/appointments/:id/accept

        app.patch("/api/doctor/appointments/:id/accept", async (req, res) => {
            const { id } = req.params;
            const { doctorId } = req.body;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id), doctorId },
                    { $set: { appointmentStatus: "accepted" } }
                );
                if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/doctor/appointments/:id/reject

        app.patch("/api/doctor/appointments/:id/reject", async (req, res) => {
            const { id } = req.params;
            const { doctorId } = req.body;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id), doctorId },
                    { $set: { appointmentStatus: "rejected" } }
                );
                if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/doctor/appointments/:id/complete
        app.patch("/api/doctor/appointments/:id/complete", async (req, res) => {
            const { id } = req.params;
            const { doctorId } = req.body;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const result = await appointmentsCollection.updateOne(
                    { _id: new ObjectId(id), doctorId },
                    { $set: { appointmentStatus: "completed", completedAt: new Date() } }
                );
                if (result.matchedCount === 0) return res.status(404).json({ error: "Appointment not found" });
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });




        //  4. PRESCRIPTION MANAGEMENT


        // GET /api/doctor/prescriptions?doctorId=xxx

        app.get("/api/doctor/prescriptions", async (req, res) => {
            const { doctorId } = req.query;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const prescriptions = await prescriptionsCollection
                    .find({ doctorId })
                    .sort({ createdAt: -1 })
                    .toArray();

                // Patient info enrich
                const enriched = await Promise.all(
                    prescriptions.map(async (p) => {
                        try {
                            const patient = await usersCollection.findOne({ id: p.patientId });
                            return {
                                ...p,
                                patientName: patient?.name || "Unknown",
                                patientEmail: patient?.email || null,
                            };
                        } catch {
                            return p;
                        }
                    })
                );

                res.json(enriched);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // GET /api/doctor/prescriptions/:appointmentId

        app.get("/api/doctor/prescriptions/:appointmentId", async (req, res) => {
            const { appointmentId } = req.params;
            try {
                const prescription = await prescriptionsCollection.findOne({ appointmentId });
                res.json(prescription || null);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // POST /api/doctor/prescriptions

        app.post("/api/doctor/prescriptions", async (req, res) => {
            const { doctorId, patientId, appointmentId, diagnosis, medications, notes } = req.body;
            if (!doctorId || !patientId || !appointmentId) {
                return res.status(400).json({ error: "doctorId, patientId, appointmentId required" });
            }

            try {
                // Already exists check
                const existing = await prescriptionsCollection.findOne({ appointmentId });
                if (existing) {
                    return res.status(400).json({ error: "Prescription already exists for this appointment" });
                }

                const result = await prescriptionsCollection.insertOne({
                    doctorId,
                    patientId,
                    appointmentId,
                    diagnosis,
                    medications, // array: [{ name, dosage, duration }]
                    notes,
                    createdAt: new Date(),
                });
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/doctor/prescriptions/:id

        app.patch("/api/doctor/prescriptions/:id", async (req, res) => {
            const { id } = req.params;
            const { diagnosis, medications, notes } = req.body;

            try {
                const result = await prescriptionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { diagnosis, medications, notes, updatedAt: new Date() } }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });



        //  5. DOCTOR PROFILE MANAGEMENT


        // GET /api/doctor/profile?doctorId=xxx

        app.get("/api/doctor/profile", async (req, res) => {
            const { doctorId } = req.query;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const doctor = await doctorsCollection.findOne({ userId: doctorId });
                if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });
                res.json(doctor);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH /api/doctor/profile

        app.patch("/api/doctor/profile", async (req, res) => {
            const { doctorId, ...updateData } = req.body;
            if (!doctorId) return res.status(400).json({ error: "doctorId required" });

            try {
                const result = await doctorsCollection.updateOne(
                    { userId: doctorId },
                    { $set: updateData }
                );
                res.json(result);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });



        // ════════════════════════════════════════════════════════════════
        // ADMIN DASHBOARD APIs



        // 1. ADMIN OVERVIEW (Dashboard Home)                         


        // GET /api/admin/overview
        app.get("/api/admin/overview", async (req, res) => {
            try {
                const [users, doctors, appointments, payments] = await Promise.all([
                    usersCollection.find({}).toArray(),
                    doctorsCollection.find({}).toArray(),
                    appointmentsCollection.find({}).toArray(),
                    paymentsCollection.find({}).toArray(),
                ]);

                const totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0);

                res.json({
                    totalUsers: users.length,
                    totalPatients: users.filter(u => u.role === "patient").length,
                    totalDoctors: doctors.length,
                    verifiedDoctors: doctors.filter(d => d.verificationStatus === "verified").length,
                    pendingDoctors: doctors.filter(d => d.verificationStatus === "pending").length,
                    totalAppointments: appointments.length,
                    pendingAppointments: appointments.filter(a => a.appointmentStatus === "pending").length,
                    totalRevenue,
                    totalPayments: payments.length,
                    suspendedUsers: users.filter(u => u.status === "suspended").length,
                });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });



        //   5. ANALYTICS                                               

        // GET /api/admin/analytics
        app.get("/api/admin/analytics", async (req, res) => {
            try {
                const [users, doctors, appointments, payments, reviews] = await Promise.all([
                    usersCollection.find({}).toArray(),
                    doctorsCollection.find({}).toArray(),
                    appointmentsCollection.find({}).toArray(),
                    paymentsCollection.find({}).toArray(),
                    reviewsCollection.find({}).toArray(),
                ]);

                // ── Platform Stats ────────────────────────────
                const totalPatients = users.filter(u => u.role === "patient").length;
                const totalDoctors = doctors.length;
                const totalAppointments = appointments.length;
                const totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0);

                // ── Appointment Status Breakdown ──────────────
                const appointmentStats = {
                    pending: appointments.filter(a => a.appointmentStatus === "pending").length,
                    accepted: appointments.filter(a => a.appointmentStatus === "accepted").length,
                    completed: appointments.filter(a => a.appointmentStatus === "completed").length,
                    cancelled: appointments.filter(a => a.appointmentStatus === "cancelled").length,
                    rejected: appointments.filter(a => a.appointmentStatus === "rejected").length,
                };

                // ── Doctor Performance (Rating based) ─────────
                const doctorPerformance = await Promise.all(
                    doctors.slice(0, 10).map(async (doc) => {
                        const docReviews = reviews.filter(r => r.doctorId === doc.userId);
                        const avgRating = docReviews.length
                            ? (docReviews.reduce((s, r) => s + (r.rating || 0), 0) / docReviews.length).toFixed(1)
                            : 0;
                        const docAppointments = appointments.filter(a => a.doctorId === doc.userId);
                        return {
                            name: doc.doctorName || "Unknown",
                            specialization: doc.specialization || "General",
                            avgRating: parseFloat(avgRating),
                            totalReviews: docReviews.length,
                            totalAppointments: docAppointments.length,
                            verificationStatus: doc.verificationStatus || "pending",
                        };
                    })
                );

                // ── Monthly Revenue (last 6 months) ───────────
                const monthlyRevenue = [];
                for (let i = 5; i >= 0; i--) {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const month = date.toLocaleString("en-US", { month: "short" });
                    const year = date.getFullYear();
                    const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;

                    const monthPayments = payments.filter(p =>
                        p.paymentDate?.startsWith(monthKey)
                    );
                    monthlyRevenue.push({
                        month,
                        revenue: monthPayments.reduce((s, p) => s + (p.amount || 0), 0),
                        count: monthPayments.length,
                    });
                }

                // ── Monthly Appointments (last 6 months) ──────
                const monthlyAppointments = [];
                for (let i = 5; i >= 0; i--) {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const month = date.toLocaleString("en-US", { month: "short" });
                    const year = date.getFullYear();
                    const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;

                    const monthApts = appointments.filter(a =>
                        a.appointmentDate?.startsWith(monthKey)
                    );
                    monthlyAppointments.push({
                        month,
                        total: monthApts.length,
                        completed: monthApts.filter(a => a.appointmentStatus === "completed").length,
                        cancelled: monthApts.filter(a => a.appointmentStatus === "cancelled").length,
                    });
                }

                res.json({
                    // Platform stats
                    totalPatients,
                    totalDoctors,
                    totalAppointments,
                    totalRevenue,
                    totalReviews: reviews.length,

                    // Breakdowns
                    appointmentStats,
                    doctorPerformance: doctorPerformance.sort((a, b) => b.avgRating - a.avgRating),
                    monthlyRevenue,
                    monthlyAppointments,

                    // Doctor verification stats
                    verificationStats: {
                        verified: doctors.filter(d => d.verificationStatus === "verified").length,
                        pending: doctors.filter(d => d.verificationStatus === "pending").length,
                        rejected: doctors.filter(d => d.verificationStatus === "rejected").length,
                    },
                });
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