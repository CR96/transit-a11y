import bcrypt from 'bcryptjs';
import express from 'express';
import validator from 'express-validator';
import httpErrors from 'http-errors';
import { errorFormatter } from '../../utils.js';

export const router = express.Router();

const schema = {
    username: {
        in: 'body',
        isAlphanumeric: true
    },
    password: {
        in: 'body',
        isEmpty: { negated: true }
    }
};

router.get('/', async function(req, res, next) {
    res.render('account/login', { title: 'Login' });
});

router.post('/', validator.checkSchema(schema), async function(req, res, next) {
    // Check incoming parameters
    const errors = validator.validationResult(req).formatWith(errorFormatter);
    if (!errors.isEmpty()) {
        res.status(new httpErrors.BadRequest().status).json({ errors: errors.mapped() }); return;
    }
    
    const client = req.app.locals.client;
    const { username, password } = validator.matchedData(req);
    
    // Get hashed password from the database
    const user = await client.ft.search('idx:users', '@username:{' + username + '}');
    const hash = user.documents[0]?.value?.password;
    
    if (!hash || !bcrypt.compareSync(password, hash)) {
        // User doesn't exist or password doesn't match hash
        res.json({ errors: { password: 'Invalid username or password' } }); return;
    }
    
    // Successfully validated credentials, now create session
    req.session.user = user.documents[0].id.replace('users:', '');
    req.session.save();
    
    res.json({});
});