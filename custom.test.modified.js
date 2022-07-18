// [assignment] please copy the entire modified custom.test.js here

const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

function getAddress(pubkey) {
  return '0x' + String(ethers.utils.keccak256(pubkey)).slice(-40)
}

async function findUtxo(
  tornadoPool,
  keypair
) {
  const filter = tornadoPool.filters.NewCommitment()
  const block = await ethers.provider.getBlock()
  const events = await tornadoPool.queryFilter(filter, block.number)
  // Check all outputs of the Utxo
  for(let i = 0; i < events.length; i++) {
    try {
      return Utxo.decrypt(keypair, events[i].args.encryptedOutput, events[0].args.index)
    }
    catch(e) {}
   }
}

async function depositInL1(
  depositUtxo,
  tornadoPool,
  omniBridge,
  token
) {

  // Preparing ZK proof
  const { args, extData } = await prepareTransaction({
    tornadoPool,
    outputs: [depositUtxo],
  })
  const bridgedData = encodeDataForBridge({
    proof: args,
    extData,
  })

  // Transfering tokens to omniBridge
  await token.transfer(omniBridge.address, depositUtxo.amount)

  // Preparing callData to claim the tokens transferred
  const bridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
    token.address,
    depositUtxo.amount,
    bridgedData,
  )

  // Preparing omniBridge -> pool tx
  const transferTx = await token.populateTransaction.transfer(
    tornadoPool.address,
    depositUtxo.amount
  )

  // Mocking calls from omniBridge
  await omniBridge.execute([
    { who: token.address, callData: transferTx.data }, // Sending tokens to pool
    { who: tornadoPool.address, callData: bridgedTx.data }, // Claim the tokens
  ])
}

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
      // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const alice = new Keypair()
    
    DEPOSIT_AMOUNT = utils.parseEther('0.1')
    WITHDRAW_AMOUNT = utils.parseEther('0.08')

    /*
      =====
      Deposit 0.1 ETH in L1
      =====
    */
    const depositUtxo = new Utxo({
      amount: DEPOSIT_AMOUNT,
      keypair: alice
    })

    await depositInL1(
      depositUtxo,
      tornadoPool,
      omniBridge,
      token
    )

    expect(await token.balanceOf(omniBridge.address)).to.be.equal(0)
    expect(await token.balanceOf(tornadoPool.address)).to.be.equal(depositUtxo.amount)

    /*
      =====
      Withdraw 0.08 ETH in L2
      =====
    */
    const ethAddress = getAddress(alice.pubkey)
    const changeUtxo = new Utxo({
      amount: depositUtxo.amount.sub(WITHDRAW_AMOUNT),
      keypair: alice,
    })

    await transaction({
      tornadoPool,
      inputs: [depositUtxo],
      outputs: [changeUtxo],
      recipient: ethAddress,
    })

    // Verify balances
    expect(await token.balanceOf(ethAddress)).to.be.equal(WITHDRAW_AMOUNT)
    expect(await token.balanceOf(tornadoPool.address)).to.be.equal(depositUtxo.amount.sub(WITHDRAW_AMOUNT))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
      // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const alice = new Keypair()
    const bob = new Keypair()

    const DEPOSIT_AMOUNT = utils.parseEther('0.13')
    const SEND_AMOUNT = utils.parseEther('0.06')

    /*
      =====
      Deposit 0.13 ETH in L1
      =====
    */
    const depositUtxo = new Utxo({
      amount: DEPOSIT_AMOUNT,
      keypair: alice
    })

    await depositInL1(
      depositUtxo,
      tornadoPool,
      omniBridge,
      token
    )

    expect(await token.balanceOf(omniBridge.address)).to.be.equal(0)
    expect(await token.balanceOf(tornadoPool.address)).to.be.equal(depositUtxo.amount)

    /*
      =====
      Alice Sends 0.06 ETH to Bob in L2
      =====
    */
    const SendL2Utxo = new Utxo({ 
      amount: SEND_AMOUNT,
      keypair: Keypair.fromString(bob.address()) 
    })
    const ChangeL2Utxo = new Utxo({
      amount: DEPOSIT_AMOUNT.sub(SEND_AMOUNT),
      keypair: alice,
    })
    await transaction({
      tornadoPool,
      inputs: [depositUtxo],
      outputs: [SendL2Utxo, ChangeL2Utxo]
    })

    const receivedUtxo = await findUtxo(tornadoPool, bob)

    expect(receivedUtxo.amount).to.be.equal(SEND_AMOUNT)

    /*
      =====
      Bob Withdraws in L2
      =====
    */
    await transaction({
      tornadoPool,
      inputs: [receivedUtxo],
      outputs: [],
      recipient: getAddress(bob.pubkey),
    })

    expect(await token.balanceOf(tornadoPool.address)).to.be.equal(DEPOSIT_AMOUNT.sub(SEND_AMOUNT))
    expect(await token.balanceOf(getAddress(bob.pubkey))).to.be.equal(SEND_AMOUNT)

    /*
      =====
      Alice Withdraws in L1
      =====
    */
    await transaction({
      tornadoPool,
      inputs: [ChangeL2Utxo],
      outputs: [],
      recipient: getAddress(alice.pubkey),
      isL1Withdrawal: true,
    })

    expect(await token.balanceOf(tornadoPool.address)).to.be.equal(0)
    expect(await token.balanceOf(getAddress(alice.pubkey))).to.be.equal(0)
  })
})
