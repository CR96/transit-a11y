import React, { useEffect} from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icon';
import { useQuery } from '../hooks/query';
import { useAuth } from '../hooks/auth';

export const LogoutPage = () => {
    const { setAuth } = useAuth();
    
    useQuery({
        method: 'get',
        url: '/api/account/logout'
    });
    
    useEffect(() => setAuth({}), [ setAuth ]);
    
    return pug`
        .notice-fullscreen
            Icon(name= "login")
            h1 Logged out
            p
                |You've successfully been logged out. Would you like
                |to #[Link(to="/") return home]
                |or #[Link(to="/account/login") log back in]?
    `;
};