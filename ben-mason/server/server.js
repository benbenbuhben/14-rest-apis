'use strict'

// Application dependencies
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const pg = require('pg');
const superagent = require('superagent');
const bodyparser = require('body-parser');

// Application Setup
const app = express();
const PORT = process.env.PORT;
const CLIENT_URL = process.env.CLIENT_URL;
const TOKEN = process.env.TOKEN;

// COMMENT: Explain the following line of code. What is the API_KEY? Where did it come from?
// This API key was generated on google's developers site and it provides credentials verifiction to implement specified google apis.
const API_KEY = process.env.GOOGLE_API_KEY;

// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// Application Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// API Endpoints
app.get('/api/v1/admin', (req, res) => {
  console.log(TOKEN);
  console.log(parseInt(req.query.token));
  res.send(TOKEN === parseInt(req.query.token));
}
);

app.get('/api/v1/books/find', (req, res) => {
  let url = 'https://www.googleapis.com/books/v1/volumes';

  // COMMENT: Explain the following four lines of code. How is the query built out? What information will be used to create the query? The query comes from a click listener in the initSearchFormPage function. The values that the user submit get set as property values in an object called books that gets sent here over via ajax get request from book.js. This objet is then parsed out below and set to the appropriate query values. It also accounts for blank input fields (i.e., fields aren't required)
  let query = ''
  if(req.query.title) query += `+intitle:${req.query.title}`;
  if(req.query.author) query += `+inauthor:${req.query.author}`;
  if(req.query.isbn) query += `+isbn:${req.query.isbn}`;

  // COMMENT: What is superagent? How is it being used here? What other libraries are available that could be used for the same purpose? 
  //Superagent is the proxy to protect your API key and send your query to the specified URL (in this case, google books api). Another library that could be used is Axios.
  superagent.get(url)
    .query({'q': query})
    .query({'key': API_KEY})
    .then(response => response.body.items.map((book, idx) => {

      // COMMENT: The line below is an example of destructuring. Explain destructuring in your own words. 
      //Destructuring allows you to set the values of an array of object to individual variables.
      let { title, authors, industryIdentifiers, imageLinks, description } = book.volumeInfo;

      // COMMENT: What is the purpose of the following placeholder image?
      //If no image url is passed back, it will display the placeholder image (done via ternary operator)
      let placeholderImage = 'http://www.newyorkpaddy.com/images/covers/NoCoverAvailable.jpg';

      // COMMENT: Explain how ternary operators are being used below.
      // If there are no search results passed back (no matches), the response strings will be supplied (i.e., if the ternary operator evaluates to false)
      return {
        title: title ? title : 'No title available',
        author: authors ? authors[0] : 'No authors available',
        isbn: industryIdentifiers ? `ISBN_13 ${industryIdentifiers[0].identifier}` : 'No ISBN available',
        image_url: imageLinks ? imageLinks.smallThumbnail : placeholderImage,
        description: description ? description : 'No description available',
        book_id: industryIdentifiers ? `${industryIdentifiers[0].identifier}` : '',
      }
    }))
    .then(arr => res.send(arr))
    .catch(console.error)
})

// COMMENT: How does this route differ from the route above? What does ':isbn' refer to in the code below?
// When one book is selected, it uses the ISBN to pull from google's api that exact book.
app.get('/api/v1/books/find/:isbn', (req, res) => {
  let url = 'https://www.googleapis.com/books/v1/volumes';
  superagent.get(url)
    .query({ 'q': `+isbn:${req.params.isbn}`})
    .query({ 'key': API_KEY })
    .then(response => response.body.items.map((book, idx) => {
      let { title, authors, industryIdentifiers, imageLinks, description } = book.volumeInfo;
      let placeholderImage = 'http://www.newyorkpaddy.com/images/covers/NoCoverAvailable.jpg';

      return {
        title: title ? title : 'No title available',
        author: authors ? authors[0] : 'No authors available',
        isbn: industryIdentifiers ? `ISBN_13 ${industryIdentifiers[0].identifier}` : 'No ISBN available',
        image_url: imageLinks ? imageLinks.smallThumbnail : placeholderImage,
        description: description ? description : 'No description available',
      }
    }))
    .then(book => res.send(book[0]))
    .catch(console.error)
})

app.get('/api/v1/books', (req, res) => {
  client.query(`SELECT book_id, title, author, image_url, isbn FROM books;`)
    .then(results => res.send(results.rows))
    .catch(console.error);
});

app.get('/api/v1/books/:id', (req, res) => {
  client.query(`SELECT * FROM books WHERE book_id=${req.params.id}`)
    .then(results => res.send(results.rows))
    .catch(console.error);
});

app.post('/api/v1/books', (req, res) => {
  let {title, author, isbn, image_url, description} = req.body;
  client.query(`
    INSERT INTO books(title, author, isbn, image_url, description) VALUES($1, $2, $3, $4, $5)`,
    [title, author, isbn, image_url, description]
  )
  .then(results => res.sendStatus(201))
  .catch(console.error);
});

app.put('/api/v1/books/:id', (req, res) => {
  let {title, author, isbn, image_url, description} = req.body;
  client.query(`
    UPDATE books
    SET title=$1, author=$2, isbn=$3, image_url=$4, description=$5
    WHERE book_id=$6`,
    [title, author, isbn, image_url, description, req.params.id]
  )
  .then(() => res.sendStatus(204))
  .catch(console.error)
})

app.delete('/api/v1/books/:id', (req, res) => {
  client.query('DELETE FROM books WHERE book_id=$1', [req.params.id])
  .then(() => res.sendStatus(204))
  .catch(console.error);
});

app.get('*', (req, res) => res.redirect(CLIENT_URL));

loadDB();

app.listen(PORT, () => console.log(`Listening on port: ${PORT}`));

//////////

function loadBooks() {


  console.log('loadBooks function called');
  client.query('SELECT COUNT(*) FROM books')
    .then(result => {

      if (!parseInt(result.rows[0].count)) {
        fs.readFile('../client/data/books.json', 'utf8', (err, fd) => {
          JSON.parse(fd).forEach(ele => {
            client.query(`
              INSERT INTO
              books(title, author, isbn, image_url, description)
              VALUES ($1, $2, $3, $4, $5);
            `, [ele.title, ele.author, ele.isbn, ele.image_url, ele.description])
          })
        })
      }
    })
}

function loadDB() {

  console.log('loadDB function called');
  client.query(`
    CREATE TABLE IF NOT EXISTS books (
      book_id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(255) NOT NULL,
      isbn VARCHAR (255) NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      description TEXT);`)
    .then(() => {
      loadBooks();
    })
    .catch(err => {
      console.error(err);
    });
}
