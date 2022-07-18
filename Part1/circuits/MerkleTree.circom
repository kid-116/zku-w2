pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    component hashers[2**n - 1];
    
    for(var i = 0; i < 2**n; i += 2) {
        hashers[i / 2] = Poseidon(2);
        hashers[i / 2].inputs[0] <== leaves[i];
        hashers[i / 2].inputs[1] <== leaves[i + 1];
    }

    var i = 0;
    var j = 2**(n - 1);
    while(j < 2**n - 1) {
        hashers[j] = Poseidon(2);
        hashers[j].inputs[0] <== hashers[i].out;
        hashers[j].inputs[1] <== hashers[i + 1].out;
        i += 2;
        j++;
    }

    root <== hashers[2**n - 2].out;
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
    component hashers[n];
    signal _left[n], left[n];
    signal _right[n], right[n];

    _left[0] <== path_index[0] * path_elements[0];
    left[0] <== _left[0] + (1 - path_index[0]) * leaf;
    _right[0] <== (1 - path_index[0]) * path_elements[0];
    right[0] <== _right[0] + path_index[0] * leaf;
    hashers[0] = Poseidon(2);
    hashers[0].inputs[0] <== left[0];
    hashers[0].inputs[1] <== right[0];

    for(var i = 1; i < n; i++) {
        _left[i] <== path_index[i] * path_elements[i];
        left[i] <== _left[i] + (1 - path_index[i]) * hashers[i - 1].out;
        _right[i] <== (1 - path_index[i]) * path_elements[i];
        right[i] <== _right[i] + path_index[i] * hashers[i - 1].out;
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
    }

    root <== hashers[n - 1].out;
}
