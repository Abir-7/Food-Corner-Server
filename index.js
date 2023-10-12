const express = require('express')
const app = express()

require('dotenv').config()

const port = process.env.PORT || 4000;
const cors = require('cors');

const jwt = require('jsonwebtoken')

//Middleware
app.use(cors())
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  // console.log(authorization)
  if (!authorization) {
    console.log('1')
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_Token, (err, decoded) => {
    if (err) {
      console.log('2')
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.o5aamuw.mongodb.net/?retryWrites=true&w=majority`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("Food_Corner").collection("users");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_Token, { expiresIn: '6h' })
      res.send({ token })
    })


    //use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      console.log(user)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }


    app.get('/', (req, res) => {
      res.send('Hello World!')
    })

    ////////////////////////---USER API---/////////////////////////
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      console.log('hi')
      const data = req.body
      console.log(data, '111')

      const query = { email: data.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ result: true })
      }

      const result = await usersCollection.insertOne(data)
      res.send(result)
    })
    ////////////////////////---USER API END---/////////////////////////

    ////////////////////////---Admin API ---/////////////////////////
    app.get('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email: email })
      console.log(result.role)
      if (result.role === 'admin') {
        res.send( true )
      }
      else {
        res.send(false )
      }

      //res.send(result)
    })

    ////////////////////////---Admin API END ---/////////////////////////



    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`)
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);
