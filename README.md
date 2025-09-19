# shopping-list-microservices

## Contexto: O que são aplicações distribuídas?

Aplicações distribuídas são sistemas compostos por múltiplos serviços independentes que se comunicam entre si, geralmente por meio de rede. Cada serviço é responsável por uma parte específica da lógica do sistema, podendo ser desenvolvido, implantado e escalado de forma independente. Esse modelo traz benefícios como maior resiliência, facilidade de manutenção e escalabilidade, sendo muito utilizado em arquiteturas modernas de microserviços.

---

## Serviços do repositório

- **User Service**
  - Responsável pelo cadastro, autenticação e gerenciamento de usuários.
  - Fornece endpoints para registro, login e consulta de informações do usuário.

- **Item Service**
  - Gerencia os itens que podem ser adicionados às listas de compras.
  - Permite buscar, cadastrar e listar itens disponíveis.

- **List Service**
  - Gerencia as listas de compras dos usuários.
  - Permite criar listas, adicionar itens a listas e consultar listas existentes.

---

## O que é o API Gateway?

O API Gateway é um ponto de entrada único para o sistema distribuído. Ele recebe todas as requisições dos clientes e as encaminha para o serviço apropriado (user, item ou list). Também agrega respostas, faz roteamento, aplica políticas de segurança e pode implementar mecanismos como circuit breaker e service discovery. No contexto deste projeto, o API Gateway facilita a comunicação entre o cliente e os microserviços, centralizando o acesso e simplificando a arquitetura.

---

## INSTRUÇÕES DE EXECUÇÃO

### Setup

```bash
npm install
```

Execução:

```bash
# Terminal 1
cd services/user-service && npm start
```

```bash
# Terminal 2  
cd services/item-service && npm start
```

```bash
# Terminal 3
cd services/list-service && npm start
```

```bash
# Terminal 4
cd api-gateway && npm start
```

# Terminal 5 - Teste
```bash
node client-demo.js
```

Verificação:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/registry
```