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
  ////////console.log(authorization)
  if (!authorization) {
    ////////console.log('1')
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_Token, (err, decoded) => {
    if (err) {
      ////////console.log('2')
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

// Function to shuffle an array using the Fisher-Yates (Knuth) shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
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
    const reviewCollection = client.db("Food_Corner").collection("usersReviews");
    const feedbackCollection = client.db("Food_Corner").collection("usersFeedback");



    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_Token, { expiresIn: '10h' })
      res.send({ token })
    })


    //use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      ////////console.log('verify admin')
      const email = req.decoded.email;
      ////console.log(email, 'veryfy admin')
      const query = { email: email }
      const user = await usersCollection.findOne(query);

      if (user) {
        if (user?.role !== 'admin') {
          ////console.log('false section')
          return res.status(403).send({ error: true, message: 'forbidden Access', isAdmin: false });
        }
      }
      next();
    }


    app.get('/', (req, res) => {
      ////////console.log('hi')
      res.send('Hello World!')
    })

    ///////////////////---All payment And Order Api---/////////////////////


    app.post("/create-payment-intent", verifyJWT, async (req, res) => {

      const email = req.decoded.email

      const { price } = req.body;
      const amount = price * 100
      //////console.log(email, 'line 96', amount)

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

    //---- get  user order info

    app.get("/getOrderInfo/:email", verifyJWT, async (req, res) => {
      const providedEmail = req.params?.email
      const decodedEmail = req.decoded.email

      if (providedEmail == decodedEmail) {
        const user = await usersCollection.findOne({ email: providedEmail })
        if (user.role == 'admin') {
          const query = { status: 'Pending' }
          const query1 = { status: 'Delivered' }
          const result = await paymentCollection.find(query).toArray()
          const result1 = await paymentCollection.find(query1).toArray()
          console.log(result, result1)
          return res.send({ result, result1 })
        }
        else {
          const query = {
            $and: [
              { userEmail: decodedEmail || providedEmail },
              { status: 'Pending' }
            ]

          }

          const query1 = {
            $and: [
              { userEmail: decodedEmail || providedEmail },
              { status: 'Delivered' }
            ]

          }

          const result = await paymentCollection.find(query).toArray()
          const result1 = await paymentCollection.find(query1).toArray()
          console.log(result1)
          return res.send({ result, result1 })
        }
      }
      else {
        res.send([])
      }

    })

    //---modify order status

    app.patch('/modifyOrderStatus', verifyJWT, verifyAdmin, async (req, res) => {
      const status = req.body.status
      const paymentID = req.body.paymentID
      ////console.log(status, paymentID)

      const providedEmail = req.body.userEmail
      const decodedEmail = req.decoded.email
      ////console.log(providedEmail,decodedEmail)
      if (decodedEmail == providedEmail) {

        const filter = { paymentID: paymentID };

        const updateDoc = {
          $set: {
            status: status,
            deliveryDate: new Date().toLocaleDateString(),
            deliveryTime: new Date().toLocaleTimeString()
          },
        }
        const options = { upsert: true };

        const result = await paymentCollection.updateOne(filter, updateDoc, options)
        ////console.log(result)
        return res.send(result)
      }

    })


    ///---get ordered item percentage

    app.get('/orderItemPercent', verifyJWT, verifyAdmin, async (req, res) => {
      const query1 = { status: 'Delivered' }
      const orders = await paymentCollection.find(query1).toArray();

      const foodPercentages = {};

      // Step 2: Iterate through each order
      orders.forEach(order => {
        // Step 3: Iterate through each cart item
        order.cartItem.forEach(item => {
          // Step 4: Sum the quantities for each food item
          const itemName = item.name;
          const quantity = item.amount;

          if (foodPercentages[itemName]) {
            foodPercentages[itemName] += quantity;
          } else {
            foodPercentages[itemName] = quantity;
          }
        });
      });

      const totalQuantity = Object.values(foodPercentages).reduce((total, quantity) => total + quantity, 0);

      // Step 5 and 6: Calculate and return percentages as an array of objects
      const percentages = [];
      Object.keys(foodPercentages).forEach(itemName => {
        const quantity = foodPercentages[itemName];
        const percentage = (quantity / totalQuantity) * 100;
        percentages.push({ name: itemName, percent: percentage.toFixed(2) });
      });

      // Step 7: Sort percentages array in descending order
      percentages.sort((a, b) => b.percent - a.percent);

      // Step 8: Get the top 10 items
      const top10Items = percentages.slice(0, 10);

      res.send(top10Items);
    })

    //////////////////////////---End---//////////////////////////

    ////////////////////////---USER API---/////////////////////////
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      ////////console.log('get user')
      const result = await usersCollection.find().toArray()
      res.send(result)
    })



    app.get('/singleUsers', verifyJWT, async (req, res) => {
      ////////console.log('get single  user')
      const email = req.decoded.email;

      const query = { email: email }
      const result = await usersCollection.findOne(query)

      res.send(result)
    })


    app.get('/singleUsers/:email', verifyJWT, async (req, res) => {
      //console.log('get single  user')
      const providedEmail = req.params.email
      const email = req.decoded.email;

      const query = { email: providedEmail }
      const result = await usersCollection.findOne(query)
      //console.log(result,providedEmail)
      res.send(result)
    })



    app.post('/users', async (req, res) => {
      ////////console.log('add  user')
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
      ////////console.log('update  user')
      ////////console.log('hi')
      const email = req.decoded.email;

      const data = req.body
      ////////console.log(data, '111')

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
      ////console.log('get admin or user')

      const email = req.decoded.email;
      ////console.log(email, 'line 193')
      if (email) {
        const result = await usersCollection.findOne({ email: email })
        ////console.log(result?.role, '145')
        if (result?.role === 'admin') {
          ////console.log('true section')
          res.status(200).send(true)

        }
        else {
          ////////console.log('get admin or user 3')
          res.status(403).send(false)
        }
      }
    })


    ////////////////////////---Admin API END ---/////////////////////////


    /////////////////////////---Menu Item Api---///////////////////////

    //Add Menu//
    app.post('/addMenu', verifyJWT, verifyAdmin, async (req, res) => {
      ////////console.log('add menu')
      const data = req.body
      //////////console.log(data,';;;;')
      const result = await menuCollection.insertOne(data)
      res.send(result)
    })

    app.get('/getMenu', async (req, res) => {

      const category=req.query.name
      const cuisine=req.query.cuisine

      const query = {
        $and: [
         cuisine!=='all'? { cuisine: cuisine }:{},
         category !== 'all' ? { category: category } : {},
        
        ]
      }

      const result = await menuCollection.find(query).toArray();

      const ratingPromises = result.map(async (item) => {
        const { _id } = item;
        const ratings = await reviewCollection.find({ menuID: new ObjectId(_id).toString() }).toArray();
        const sum = ratings.reduce((total, rating) => total + rating.rating, 0);
        const count = ratings.length;
        const average = count > 0 ? sum / count : 0;
        item.averageRating = average;
      });
    
      await Promise.all(ratingPromises);
    
      console.log(result);
      res.send(result)
    })

    app.get('/shopOurFav', async (req, res) => {
      const result = await menuCollection.find().toArray();

      const ratingPromises = result.map(async (item) => {
        const { _id } = item;
        const ratings = await reviewCollection.find({ menuID: new ObjectId(_id).toString() }).toArray();
        const sum = ratings.reduce((total, rating) => total + rating.rating, 0);
        const count = ratings.length;
        const average = count > 0 ? sum / count : 0;
        item.averageRating = average;
        item.totalCustomer=count
      });
    
      await Promise.all(ratingPromises);
    
      console.log(result);

      result.sort((a, b) => {
        if (b.averageRating !== a.averageRating) {
          return b.averageRating - a.averageRating;
        }
        return b.totalCustomer - a.totalCustomer;
      })

      
      const limitedResult = result.slice(0, 4)
      res.send(limitedResult)
    })


    app.get('/thaiCuisine', async (req, res) => {
      const query = {
        $and: [
          { cuisine: 'Thai' },
          { category: 'Rice' },
          { time: 'Dinner' }
        ]
      }
      const result = await menuCollection.find(query).toArray()
      //res.send(result)
      const ratingPromises = result.map(async (item) => {
        const { _id } = item;
        const ratings = await reviewCollection.find({ menuID: new ObjectId(_id).toString() }).toArray();
        const sum = ratings.reduce((total, rating) => total + rating.rating, 0);
        const count = ratings.length;
        const average = count > 0 ? sum / count : 0;
        item.averageRating = average;
        item.totalCustomer=count
      });
    
      await Promise.all(ratingPromises);

      const randomizedResult = shuffleArray(result)

      const randomFoods = randomizedResult.slice(0, 4)

      const arrayOfIds = randomFoods.map(food => new ObjectId(food._id).toString());

      // Use aggregation to find documents with matching IDs in FavMenu collection
      const matchingDocs = await favouriteMenuCollection.aggregate([
        {
          $match: {
            menuID: { $in: arrayOfIds }
          }
        }
      ]).toArray();

      //console.log(matchingDocs,)
      // Update randomFoods with match field
      randomFoods.forEach(food => {
        food.match = matchingDocs.some(doc => doc.menuID === new ObjectId(food._id).toString());
      });

      res.send(randomFoods);

    })


    app.get('/getMenu/:id', verifyJWT, async (req, res) => {
      //////console.log('get single menu')

      const id = req.params.id
      const email = req.query.email
      //console.log(id, 'id',email)
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query)

      const {_id}=result

      const ratings=await reviewCollection.find({menuID:new ObjectId(_id).toString()}).toArray()
      const sum=ratings.reduce((total,rating)=>total+rating.rating,0)
      const count=ratings.length
      const average=count>0?sum/count:0 
      result.averageRating = average;
      result.totalCustomer=count
      //console.log(result)
      res.send(result)
    })


    app.get('/getSimilarMenu/:category', verifyJWT, async (req, res) => {
      //////console.log('get single menu')

      const category=req.params.category
      const id=req.query.id
      const query = {
        $and: [
          {category:category},
          {_id: { $ne: new ObjectId(id) } }
        ]
      }
      
      const result=await menuCollection.find(query).toArray()

      const ratingPromise=result.map(async(item)=>{
        const {_id}=item

        const ratings=await reviewCollection.find({menuID:new ObjectId(_id).toString()}).toArray()
        
        const sum=ratings?ratings.reduce((total,rating)=>total+rating.rating,0):0
        const count=ratings.length
        const average=count>0?sum/count:0 
        item.averageRating = average;
        item.totalCustomer=count
      })

      await Promise.all(ratingPromise)

      console.log(result)

      res.send(result)
    })

    app.post('/addFavMenu', verifyJWT, async (req, res) => {
      //////console.log('add to favourite')
      const menuId = req.body
      //////console.log(menuId)

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
      //////console.log('is favourite or not')
      const id = req.params.id
      const email = req.decoded.email;
      //////console.log(id, email, '---')
      const query = {
        $and: [
          { menuID: id },
          { userEmail: email }
        ]
      }
      const existingItem = await favouriteMenuCollection.findOne(query)

      if (existingItem) {
        //////console.log('true')
        return res.send({ result: true })
      }
      else {
        //////console.log('false')
        return res.send({ result: false })

      }
    })

    app.get('/favMenuData/:email', verifyJWT, async (req, res) => {
      //////console.log('get user all fav data')
      const email = req.decoded.email || req.params.email
      //////console.log(email)
      const query = { userEmail: email }
      const favMenuByUser = await favouriteMenuCollection.find(query).toArray()
      const favMenuId = favMenuByUser.map(menuId => new ObjectId(menuId.menuID))
      const result = await menuCollection.find({ _id: { $in: favMenuId } }).toArray()
      //////console.log(result)
      res.send(result)
    })

    app.delete('/deleteFavMenu', verifyJWT, async (req, res) => {
      //////console.log('delete user single fav data')
      const email = req.decoded.email || req.query.email
      const menuId = req.query.menuId
      //////console.log(email, menuId)

      const query = {
        $and: [
          { menuID: menuId },
          { userEmail: email }
        ]
      }

      const result = await favouriteMenuCollection.deleteOne(query)
      //console.log(result, 'delete')
      res.send(result)
    })


    app.patch('/modifyAvailableStatus/:id',async(req,res)=>{
      const id =req.params.id

      const filter = { _id: new ObjectId(id) };
      const status=req.body.status
      const updateDoc = {
        $set: {
        isAvailable:status
        },
      }
      const options = { upsert: true };
      const result = await menuCollection.updateOne(filter, updateDoc, options)
res.send(result)
    })


    //////////////////////////---Menu Api End---////////////////


    ////////////////---user review collection---///////////////

    app.post('/addReviews', verifyJWT, async (req, res) => {
      const data = req.body

      const query = {
        $and: [
          {
            email: data.email
          },
          {
            paymentId: data.paymentId
          },
          {
            menuID: data.menuID
          }
        ]
      }

      const match = await reviewCollection.findOne(query)

      if (match) {
        return res.send({ result: 'duplicate' })
      }
      else {

        const result = await reviewCollection.insertOne(data)
        res.send(result)
      }

    })


    app.get('/getReviews/:id', async (req, res) => {
      const id = req.params.id
      console.log(id)
      const query = { menuID: id }
      const result = await reviewCollection.find(query).toArray()
      //console.log(result)
      res.send(result)
    })


    app.post('/addFeedback', verifyJWT, async (req, res) => {
      const data = req.body
      console.log(data)
      // const query = {
      //   $and: [
      //     {
      //       email: data.email
      //     },
      //     {
      //       paymentId: data.paymentId
      //     },
      //     {
      //       menuID: data.menuID
      //     }
      //   ]
      // }

      // const match = await reviewCollection.findOne(query)

      // if (match) {
      //   return res.send({ result: 'duplicate' })
      // }
      // else {
      //   const result = await reviewCollection.insertOne(data)
      //   res.send(result)
     
      // }

      const result = await feedbackCollection.insertOne(data)
      res.send(result)
    })


    app.get('/getFeedback', async (req, res) => {
      const result = await feedbackCollection.find().toArray()
      //console.log(result)
      res.send(result)
    })


    ////////////////---user review end---///////////////



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
