const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_KEY);
const port = process.env.PORT || 5000;



// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wjtuflr.mongodb.net/?retryWrites=true&w=majority`;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fmznhrh.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const classCollection = client.db("sportsDB").collection("class");
    const paidCollection = client.db("sportsDB").collection("paid");
    const usersCollection = client.db("sportsDB").collection("users");
    const paymentCollection = client.db("sportsDB").collection("payments");
    const selectedClassCollection = client.db("sportsDB").collection("select");
    const instructorClassCollection = client.db("sportsDB").collection("instructor");
    const popularInstructorClassCollection = client.db("sportsDB").collection("popularInstructor");      

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "30d",
      });

      res.send({ token });
    });

    //instructor apis

    app.get("/instructor", async (req, res) => {
      const result = await instructorClassCollection.find().toArray();
      res.send(result);
    });

    app.get("/popularInstructor", async (req, res) => {
      const result = await popularInstructorClassCollection.find().toArray();
      res.send(result);
    });

    //class apis
    app.get("/class", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });
    app.get('/popularClass', async(req,res) => {
      const result = await classCollection.find().sort({enrolled: -1}).limit(6).toArray();
      res.send(result)
    })
    app.post("/class", async (req, res) => {
      const addedClass = req.body;
      const result = await classCollection.insertOne(addedClass);
      res.send(result);
    });
    app.patch("/class/:id", async (req, res) => {
      const id = req.params.id;
      const updated = req.body;
      console.log(updated);
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const update = {
        $set: {
          status: updated.status,
        },
      };

      const result = await classCollection.updateOne(filter, update, options);
      res.send(result);
    });
    app.delete("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });

    //selected classes apis

    app.get("/select", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    });

    //select apis

    app.delete("/select/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/select", async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedClassCollection.insertOne(selectedClass);
      res.send(result);
    });

    //user apis

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    //payment system

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.selectedItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await selectedClassCollection.deleteMany(query);

      const selectedId = payment.selectedId;

      const paidClasses = await classCollection
        .find({ _id: { $in: selectedId.map((id) => new ObjectId(id)) } })
        .toArray();
      const paidClassesWithEmail = paidClasses.map((paidClass) => {
        return {
          ...paidClass,
          email: payment.email,
          classId: paidClass._id,
          _id: undefined,
        };
      });

      const paidResult = await paidCollection.insertMany(
        paidClassesWithEmail
      );
      const updatePaidResult = await classCollection.updateMany(
        { _id: { $in: selectedId.map((id) => new ObjectId(id)) } },
        { $inc: {sets: -1, enrolled: 1 } }
    );

      res.send({ insertResult, deleteResult,paidResult,updatePaidResult });
    });


    //payments apis
    app.get('/payments',async(req,res) => {
      const result = await paymentCollection.find().sort({date: -1}).toArray();
      res.send(result)
    })

    app.get('/paid', async(req,res) => {
      const result = await paidCollection.find().toArray();
      res.send(result);
    })







    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("sports academy is running");
});

app.listen(port, () => {
  console.log(`sports academy is running on port ${port}`);
});
