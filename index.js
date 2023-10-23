const express = require('express')
const app = express()
require('dotenv').config()

const stripe = require("stripe")(`${process.env.PAYMENT_SK}`);



const port = process.env.PORT || 4000;
const cors = require('cors');

const jwt = require('jsonwebtoken')

//Middleware
app.use(cors())
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  ////console.log(authorization)
  if (!authorization) {
    ////console.log('1')
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_Token, (err, decoded) => {
    if (err) {
      ////console.log('2')
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    const menuCollection = client.db("Food_Corner").collection("allMenu");
    const favouriteMenuCollection = client.db("Food_Corner").collection("favouriteMenu");
    const paymentCollection = client.db("Food_Corner").collection("usersAllPayment");



    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_Token, { expiresIn: '10h' })
      res.send({ token })
    })


    //use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      ////console.log('verify admin')
      const email = req.decoded.email;
      console.log(email,'veryfy admin')
      const query = { email: email }
      const user = await usersCollection.findOne(query);

      if (user) {
        if (user?.role !== 'admin') {
          console.log('false section')
          return res.status(403).send({ error: true, message: 'forbidden Access', isAdmin: false });
        }
      }
      next();
    }


    app.get('/', (req, res) => {
      ////console.log('hi')
      res.send('Hello World!')
    })

    ///////////////////---Create payment Intent---/////////////////////
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {

      const email = req.decoded.email

      const { price } = req.body;
      const amount = price * 100
      //console.log(email, 'line 96', amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });


    //---save payment to server

    app.post("/savePayment", async (req, res) => {
      const data = req.body
      const result = await paymentCollection.insertOne(data)
      res.send(result)
    })



    //////////////////////////---End---//////////////////////////

    ////////////////////////---USER API---/////////////////////////
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      ////console.log('get user')
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.get('/singleUsers', verifyJWT, async (req, res) => {
      ////console.log('get single  user')
      const email = req.decoded.email;

      const query = { email: email }
      const result = await usersCollection.findOne(query)

      res.send(result)
    })

    app.post('/users', async (req, res) => {
      ////console.log('add  user')
      const data = req.body

      const query = { email: data.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ result: true })
      }

      const result = await usersCollection.insertOne(data)
      res.send(result)
    })

    app.patch('/userUpdate', verifyJWT, async (req, res) => {
      ////console.log('update  user')
      ////console.log('hi')
      const email = req.decoded.email;

      const data = req.body
      ////console.log(data, '111')

      const filter = { email: email };

      const updateDoc = {
        $set: {
          name: data.name,
          mobile: data.mobile,
          address: data.address,
          image: data.image,
        },
      }
      const options = { upsert: true };

      const result = await usersCollection.updateOne(filter, updateDoc, options)
      res.send(result)

    })

    ////////////////////////---USER API END---/////////////////////////



    ////////////////////////---Admin API ---/////////////////////////
    app.get('/user/admin', verifyJWT, verifyAdmin, async (req, res) => {
    console.log('get admin or user')
    
      const email = req.decoded.email;
      console.log(email,'line 193')
      if (email) {
        const result = await usersCollection.findOne({ email: email })
       console.log(result?.role, '145')
        if (result.role === 'admin') {
          console.log('true section')
          res.status(200).send(true)

        }
        else {
          ////console.log('get admin or user 3')
          res.status(403).send(false)
        }
      }
    })


    ////////////////////////---Admin API END ---/////////////////////////


    /////////////////////////---Menu Item Api---///////////////////////

    //Add Menu//
    app.post('/addMenu', verifyJWT, verifyAdmin, async (req, res) => {
      ////console.log('add menu')
      const data = req.body
      //////console.log(data,';;;;')
      const result = await menuCollection.insertOne(data)
      res.send(result)
    })

    app.get('/getMenu', async (req, res) => {
      ////console.log('get menu')
      const result = await menuCollection.find().toArray()
      res.send(result)
    })

    app.get('/getMenu/:id', verifyJWT, async (req, res) => {
      //console.log('get single menu')

      const id = req.params.id
      ////console.log(id, 'id')
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query)

      res.send(result)
    })

    app.post('/addFavMenu', verifyJWT, async (req, res) => {
      //console.log('add to favourite')
      const menuId = req.body
      //console.log(menuId)

      const query = {
        $and: [
          { menuID: menuId.menuID },
          { userEmail: menuId.userEmail }
        ]
      }
      const existingItem = await favouriteMenuCollection.findOne(query)

      if (existingItem) {
        await favouriteMenuCollection.deleteOne(query)

        return res.status(409).send({ result: 'repeat' })
      }
      else {
        const result = await favouriteMenuCollection.insertOne(menuId)
        return res.send(result)
      }
    })

    app.get('/favMenu/:id', verifyJWT, async (req, res) => {
      //console.log('is favourite or not')
      const id = req.params.id
      const email = req.decoded.email;
      //console.log(id, email, '---')
      const query = {
        $and: [
          { menuID: id },
          { userEmail: email }
        ]
      }
      const existingItem = await favouriteMenuCollection.findOne(query)

      if (existingItem) {
        //console.log('true')
        return res.send({ result: true })
      }
      else {
        //console.log('false')
        return res.send({ result: false })

      }
    })

    app.get('/favMenuData/:email', verifyJWT, async (req, res) => {
      //console.log('get user all fav data')
      const email = req.decoded.email || req.params.email
      //console.log(email)
      const query = { userEmail: email }
      const favMenuByUser = await favouriteMenuCollection.find(query).toArray()
      const favMenuId = favMenuByUser.map(menuId => new ObjectId(menuId.menuID))
      const result = await menuCollection.find({ _id: { $in: favMenuId } }).toArray()
      //console.log(result)
      res.send(result)
    })

    app.delete('/deleteFavMenu', verifyJWT, async (req, res) => {
      //console.log('delete user single fav data')
      const email = req.decoded.email || req.query.email
      const menuId = req.query.menuId
      //console.log(email, menuId)

      const query = {
        $and: [
          { menuID: menuId },
          { userEmail: email }
        ]
      }

      const result = await favouriteMenuCollection.deleteOne(query)
      //console.log(result)
      res.send(result)
    })


    //////////////////////////---Menu Api End---////////////////


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

