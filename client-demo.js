// Cliente de teste simples para a API Gateway

const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

const API = 'http://localhost:4000';

async function main() {
  // 1. Registro de usuário
  const regRes = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@demo.com',
      username: 'demouser',
      password: '123',
      firstName: 'Demo',
      lastName: 'User'
    })
  });
  const reg = await regRes.json();
  console.log('Registro:', reg);

  // 2. Login
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'demouser', password: '123' })
  });
  const login = await loginRes.json();
  console.log('Login:', login);

  const token = login.token;
  if (!token) {
    console.error('Login falhou, não é possível continuar.');
    return;
  }

  // 3. Busca de itens
  const itemsRes = await fetch(`${API}/api/items?name=arroz`);
  const items = await itemsRes.json();
  console.log('Busca de itens:', items);

  // 4. Criação de lista
  const listRes = await fetch(`${API}/api/lists`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name: 'Minha Lista', description: 'Lista demo' })
  });
  const list = await listRes.json();
  console.log('Lista criada:', list);

  // 5. Adição de item à lista (pega o primeiro item da busca)
  if (items.length && list.id) {
    const addItemRes = await fetch(`${API}/api/lists/${list.id}/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ itemId: items[0].id, quantity: 2 })
    });
    const addItem = await addItemRes.json();
    console.log('Item adicionado à lista:', addItem);
  } else {
    console.log('Não foi possível adicionar item à lista.');
  }

  // 6. Visualização do dashboard
  const dashRes = await fetch(`${API}/api/dashboard`, {
    headers: { 'authorization': `Bearer ${token}` }
  });
  const dashboard = await dashRes.json();
  console.log('Dashboard:', dashboard);
}

main().catch(console.error);