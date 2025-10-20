const express = require('express');
const Razorpay = require('razorpay');
const { validateWebhookSignature } = require('razorpay/dist/utils/razorpay-utils');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());

// Razorpay configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Notes dictionary (same as your current one)
const notesDictionary = {
  'c_notes': {
    name: 'C Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=13LUsRlpsgrWL7clJBTgadvEuiT6x2IsM'
  },
  'javascript_notes': {
    name: 'JavaScript Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1dNJvdn7LMzJpYzyoHz6J1sdlIv1REh7v'
  },
  'git_notes': {
    name: 'Git Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1Vvbbggz1RV7URlm1HWfdez05TXOkpYC-'
  },
  'css_notes': {
    name: 'CSS Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1puy1HziMZe-ZXR5-keYiRNzSD5mu_aDI'
  },
  'html5_notes': {
    name: 'HTML5 Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1LHZijM0mg2NOTVR_zygX1d-bzfyS6viX'
  },
  'kotlin_notes': {
    name: 'Kotlin Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1cLFvWDEHH4M3tLIJ6fNm5Xz4g1kCncK4'
  },
  'matlab_notes': {
    name: 'MatLab Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=13_9VE2pSii_CBzXTXwvRrEcQ_QSIofpY'
  },
  'mongodb_notes': {
    name: 'MongoDB Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1eGZlDrEl1vSwq6oSs76_zcCl4IEwVhIe'
  },
  'mysql_notes': {
    name: 'MySQL Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1m0hevvjSWrYOQBR3LukjKsGXCskMPEfP'
  },
  'reactjs_notes': {
    name: 'ReactJS Notes',
    price: 1,
    downloadLink: 'https://drive.google.com/uc?export=download&id=1bad37X6yX2J-giQ6E_ilrsCr1DNWr45n'
  }
  // ... include all your notes
};

// Helper functions for file operations
const readData = () => {
  try {
    const data = fs.readFileSync('/tmp/orders.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeData = (data) => {
  fs.writeFileSync('/tmp/orders.json', JSON.stringify(data, null, 2));
};

// Initialize orders file
if (!fs.existsSync('/tmp/orders.json')) {
  writeData([]);
}

// Routes
app.get('/api/get-notes', (req, res) => {
  const notesList = Object.keys(notesDictionary).map(key => ({
    id: key,
    name: notesDictionary[key].name,
    price: notesDictionary[key].price
  }));
  res.json(notesList);
});

app.post('/api/create-order', async (req, res) => {
  try {
    const { selectedNote, name, email, contact } = req.body;

    if (!notesDictionary[selectedNote]) {
      return res.status(400).json({ error: 'Invalid note selection' });
    }

    const noteDetails = notesDictionary[selectedNote];
    const amount = noteDetails.price;

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `notes_${selectedNote}_${Date.now()}`,
      notes: {
        product: selectedNote,
        product_name: noteDetails.name,
        download_link: noteDetails.downloadLink,
        customer_name: name,
        customer_email: email,
        customer_contact: contact,
        venture: 'CodeZ',
      }
    };

    const order = await razorpay.orders.create(options);
    
    const orders = readData();
    orders.push({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: 'created',
      product: selectedNote,
      product_name: noteDetails.name,
      download_link: noteDetails.downloadLink,
      customer_name: name,
      customer_email: email,
      customer_contact: contact,
      created_at: new Date().toISOString()
    });
    writeData(orders);

    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Error creating order' });
  }
});

app.post('/api/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  const body = razorpay_order_id + '|' + razorpay_payment_id;

  try {
    const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
    if (isValidSignature) {
      const orders = readData();
      const order = orders.find(o => o.order_id === razorpay_order_id);
      if (order) {
        order.status = 'paid';
        order.payment_id = razorpay_payment_id;
        order.paid_at = new Date().toISOString();
        writeData(orders);

        res.status(200).json({ 
          status: 'ok',
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          download_link: order.download_link,
          product_name: order.product_name
        });
      } else {
        res.status(404).json({ status: 'error', message: 'Order not found' });
      }
    } else {
      res.status(400).json({ status: 'verification_failed' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ status: 'error', message: 'Error verifying payment' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

module.exports = app;
